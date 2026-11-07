"""Render the 170-bar v3 arrangement with the shared offline streaming engine."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import time

from long_score import BARS, BEAT, FRAMES, PLAN, RATE, THEMES, assemble, engine_score
from render_study import OUT, SOURCES, engine, expected_lead, midi_pitch

MASTER = 'boardwalk-v3-longform.mp3'
EXCERPT = 'boardwalk-v3-c-to-b.mp3'
MIDI = 'longform-score.mid'
ARRANGEMENT = 'longform-arrangement.json'
QC = 'longform-qc.json'


def read_midi_events(data):
    """Read the actual note messages from the shared writer's format-1 file."""
    if data[:8] != b'MThd\x00\x00\x00\x06':
        raise ValueError('Unexpected MIDI header')
    _, track_count, ppq = struct.unpack_from('>HHH', data, 8)
    events = []
    cursor = 14

    def vlq():
        nonlocal cursor
        value = 0
        while True:
            byte = data[cursor]
            cursor += 1
            value = (value << 7) | (byte & 127)
            if byte < 128:
                return value

    for _ in range(track_count):
        if data[cursor:cursor+4] != b'MTrk':
            raise ValueError('Missing MIDI track')
        end = cursor + 8 + struct.unpack_from('>I', data, cursor+4)[0]
        cursor += 8
        tick = 0
        while cursor < end:
            tick += vlq()
            status = data[cursor]
            cursor += 1
            if status == 0xff:
                cursor += 1
                length = vlq()
                cursor += length
            elif status >> 4 == 12:
                cursor += 1
            elif status >> 4 in (8,9):
                pitch, velocity = data[cursor:cursor+2]
                on = int(status >> 4 == 9 and velocity > 0)
                events.append((tick, on, status & 15, pitch, velocity if on else 0))
                cursor += 2
            else:
                raise ValueError(f'Unsupported MIDI status {status:#x}')
        if cursor != end:
            raise ValueError('MIDI track length mismatch')
    if cursor != len(data):
        raise ValueError('Extra MIDI data')
    return ppq, sorted(events)


def verify_score():
    harmony, lead, notes, sections, damped, samples = assemble()
    midi = engine_score.midi(notes)
    ppq, messages = read_midi_events(midi)
    if ppq != engine_score.PPQ or messages != engine_score.events(notes, lambda t: round(t/float(BEAT)*ppq)):
        raise ValueError('Arrangement and emitted MIDI events differ')
    actual_lead = [(at, on, pitch) for at, on, channel, pitch, _ in messages if channel == 2]
    if actual_lead != expected_lead(lead, ppq):
        raise ValueError('Written melody and MIDI lead differ')
    handoffs = []
    pitched = [n for n in notes if n['part'] != 'brush']
    for section in sections[1:]:
        at = section['start_seconds']
        carry = sorted({n['part'] for n in pitched if n['start'] < at-1e-7
                        and n['start']+n['duration'] > at+1e-7})
        next_parts = sorted({n['part'] for n in pitched if abs(n['start']-at) <= 1e-7})
        if not carry or not next_parts:
            raise ValueError(f'No pitched handoff at bar {section["bar"]}')
        handoffs.append(dict(bar=section['bar'], sustain_across=carry, next_downbeat=next_parts))
    return harmony, lead, notes, sections, damped, samples, midi, messages, handoffs


def render_long(out, sources, cache, owner):
    lock_identity = engine.owner_state(owner)
    started = time.monotonic()
    harmony, lead, notes, sections, damped, samples, midi, messages, handoffs = verify_score()
    files = [MASTER, EXCERPT, MIDI, ARRANGEMENT, QC]
    out.mkdir(parents=True, exist_ok=True)
    if any((out/name).exists() for name in files):
        raise ValueError('Use a fresh output directory to preserve the completed long render')
    for name, expected in engine.HASHES.items():
        if engine.sha(cache/name) != expected:
            raise ValueError(f'Unexpected sound source identity: {name}')

    with tempfile.TemporaryDirectory(prefix='.v3-long-', dir=out) as temp:
        scratch = Path(temp)
        print(f'Rendering {BARS} bars as continuous 8192-frame blocks', flush=True)
        pcm = engine.premaster(scratch, cache, sources, notes, FRAMES, samples)
        aux = scratch/'aux.tsv'
        actual_aux = [tuple(map(int,line.split())) for line in aux.read_text().splitlines()]
        expected_aux = engine_score.events([n for n in notes if n['part'] != 'guitar'], lambda t: round(t*RATE))
        aux_lead = [(at, on, pitch) for at, on, channel, pitch, _ in actual_aux if channel == 2]
        if actual_aux != expected_aux or aux_lead != expected_lead(lead, BEAT*RATE):
            raise ValueError('Written score, MIDI and actual synth input disagree')

        source = ['-f','f32le','-ar',RATE,'-ac',2,'-i',pcm]
        before = engine.meter(source)
        gain = min(-20.7 - before['i'], -3.15 - before['tp'])
        master = scratch/MASTER
        engine.run(engine.FF+['-v','error']+source+['-af',f'volume={gain:.6f}dB','-c:a','libmp3lame','-b:a','160k',
                    '-metadata','title=Morning on the Boardwalk v3',master])
        pcm.unlink()
        after = engine.meter(['-i',master])
        if not (-24 <= after['i'] <= -19) or after['tp'] > -2:
            raise ValueError(f'Master outside study loudness/peak range: {after}')
        decoded = engine.decoded_qc(master, sections, FRAMES)
        excerpt_start = float(62*4*BEAT)
        engine.run(engine.FF+['-v','error','-ss',f'{excerpt_start:.8f}','-i',master,'-t','60',
                              '-c:a','copy','-metadata','title=Morning on the Boardwalk v3 - C to B',scratch/EXCERPT])

        (scratch/MIDI).write_bytes(midi)
        engine.write_json(scratch/ARRANGEMENT, dict(
            bpm=82, bars=BARS, sample_rate=RATE, frames=FRAMES, harmony=harmony, sections=sections,
            note_counts=Counter(n['part'] for n in notes), guitar_replucks=damped, notes=notes))
        source_paths = [PLAN, *THEMES.values(), Path(__file__), Path(__file__).with_name('long_score.py'),
                        Path(__file__).with_name('study_score.py'), Path(__file__).with_name('render_study.py'),
                        Path(__file__).with_name('check_phrase.py'), Path(engine.__file__),
                        Path(engine.__file__).with_name('aux.c'), Path(engine_score.__file__),
                        Path(engine_score.__file__).with_name('v2-seed.json')]
        engine.write_json(scratch/QC, dict(
            status='offline score, event and audio verification; full-version listening pending',
            score_notes=len(notes), written_melody_notes=len(lead), midi_events=len(messages),
            synth_aux_events=len(actual_aux), synth_aux_sha256=engine.sha(aux),
            pitched_section_handoffs=handoffs, decoded=decoded, encoded=after,
            master_linear_gain_db=round(gain,6), decoded_clipped_samples=0,
            excerpt=dict(file=EXCERPT, start_seconds=excerpt_start, target_seconds=60,
                         section_change_bar=73, section_change_master_seconds=float(72*4*BEAT),
                         method='packet copy from the one encoded master'),
            sources={path.name:engine.sha(path) for path in source_paths},
            audio_inputs=dict(soundfont_and_header=engine.HASHES,
                              guitar={name:engine_score.SEED['samples'][name] for name in samples}),
            files={name:dict(bytes=(scratch/name).stat().st_size, sha256=engine.sha(scratch/name)) for name in files[:-1]},
            elapsed_seconds=round(time.monotonic()-started,2)))
        if engine.owner_state(owner) != lock_identity:
            raise ValueError('Heavy window ownership changed')
        for name in files:
            os.link(scratch/name,out/name)
    print(json.dumps(dict(output=str(out/MASTER),seconds=FRAMES/RATE,
                          integrated_lufs=after['i'],true_peak_dbtp=after['tp'],
                          worst_interior_quiet=decoded['longest_interior_quiet_seconds'])))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--sources', type=Path, default=SOURCES)
    parser.add_argument('--cache', type=Path, default=engine.CACHE)
    parser.add_argument('--lock-owner', required=True)
    args = parser.parse_args()
    try:
        render_long(args.out.resolve(),args.sources.resolve(),args.cache.resolve(),args.lock_owner)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors='replace')[-2500:]) from error


if __name__ == '__main__':
    main()
