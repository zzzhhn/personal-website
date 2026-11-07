"""Render the approved 16 bars with the existing offline streaming engine."""
import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import time

from check_phrase import DRAFT
from study_score import BARS, BEAT, BPM, FRAMES, PPQ, RATE, compose, engine_score, midi_pitch

import render as engine  # Existing boardwalk-longform streaming mixer and aux renderer.

FILES = {'full': 'boardwalk-v3-study.mp3', 'solo': 'boardwalk-v3-melody.mp3'}
OUT = DRAFT.parent
SOURCES = (DRAFT.parents[5] / 'personal-world-phase2-integration/docs/world/phase-2-playground'
           / 'feedback-20261030/music-session-v2/source-samples')
CHANNEL = 2


def expected_lead(lead, units_per_beat):
    return sorted((round(at * units_per_beat), on, midi_pitch(note.pitch))
                  for note in lead for at, on in ((note.start, 1), (note.end, 0)))


def midi_lead(midi):
    """Read actual note events from the emitted MIDI. The writer uses full status bytes."""
    events = []
    at = 14
    while at < len(midi):
        if midi[at:at+4] != b'MTrk':
            raise ValueError('Malformed MIDI track')
        end = at + 8 + struct.unpack_from('>I', midi, at+4)[0]
        at += 8
        tick = 0

        def vlq():
            nonlocal at
            value = 0
            while True:
                byte = midi[at]
                at += 1
                value = (value << 7) | (byte & 127)
                if not byte & 128:
                    return value

        while at < end:
            tick += vlq()
            command = midi[at]
            at += 1
            if command == 0xff:
                at += 1
                length = vlq()
                at += length
            elif command >> 4 == 12:
                at += 1
            elif command >> 4 in (8, 9):
                if command & 15 == CHANNEL:
                    events.append((tick, int(command >> 4 == 9 and midi[at+1] > 0), midi[at]))
                at += 2
            else:
                raise ValueError(f'Unexpected MIDI command: {command}')
        if at != end:
            raise ValueError('MIDI track length mismatch')
    return sorted(events)


def actual_aux_lead(path):
    events = [tuple(map(int, line.split())) for line in path.read_text().splitlines()]
    return [(frame, on, pitch) for frame, on, channel, pitch, _ in events if channel == CHANNEL]


def db(value):
    return round(20 * math.log10(max(float(value), 1e-12)), 3)


def verify_mp3(path, lead, inspect_pitch, pcm_path):
    import numpy as np

    engine.run(engine.FF + ['-v', 'error', '-i', path, '-ar', RATE, '-ac', 2, '-f', 'f32le', pcm_path])
    if pcm_path.stat().st_size != FRAMES * 8:
        raise ValueError(f'Unexpected decoded frame count for {path.name}')
    pcm = np.memmap(pcm_path, dtype='<f4', mode='r', shape=(FRAMES, 2))
    peak, clipped = 0.0, 0
    for begin in range(0, FRAMES, RATE):
        block = pcm[begin:begin+RATE]
        if not np.isfinite(block).all():
            raise ValueError(f'Non-finite PCM in {path.name}')
        absolute = np.abs(block)
        peak = max(peak, np.max(absolute))
        clipped += int(np.count_nonzero(absolute >= 1))
    bars = []
    for bar in range(BARS):
        begin, end = (round(i * 4 * BEAT * RATE) for i in (bar, bar+1))
        section = pcm[begin:end]
        rms = db(np.sqrt(np.einsum('ij,ij->', section, section, dtype=np.float64) / section.size))
        bars.append(rms)
    if clipped or min(bars) < -55:
        raise ValueError(f'Clipped samples or a near-silent whole bar in {path.name}')
    measured = engine.meter(['-i', path])
    if measured['tp'] > -2:
        raise ValueError(f'True peak above study ceiling in {path.name}: {measured["tp"]}')
    result = dict(seconds=FRAMES/RATE, decoded_frames=FRAMES, sample_peak_dbfs=db(peak), clipped_samples=clipped,
                  integrated_lufs=measured['i'], true_peak_dbtp=measured['tp'], per_bar_rms_dbfs=bars,
                  bars_below_minus_55_dbfs=sum(rms < -55 for rms in bars))
    if inspect_pitch:
        # The solo waveform should contain the written fundamental just after
        # every scheduled attack. This does not measure the sampler's release.
        detections = []
        fft_size = 32768
        for note in lead:
            frame = round(note.start * BEAT * RATE)
            segment = pcm[frame+round(.03*RATE):frame+round(.15*RATE)].mean(axis=1)
            window = np.hanning(len(segment))
            spectrum = np.abs(np.fft.rfft(segment * window, n=fft_size))
            low, high = (round(f * fft_size / RATE) for f in (305, 730))
            peak_bin = low + int(np.argmax(spectrum[low:high+1]))
            left, top, right = np.log(np.maximum(spectrum[peak_bin-1:peak_bin+2], 1e-15))
            offset = .5 * (left-right) / (left-2*top+right) if left-2*top+right else 0
            peak_hz = (peak_bin+offset) * RATE / fft_size
            target_hz = 440 * 2**((midi_pitch(note.pitch)-69)/12)
            cents = round(1200 * math.log2(peak_hz / target_hz), 2)
            detections.append(dict(bar=note.bar, beat=float(note.beat), pitch=note.pitch, start_frame=frame,
                                   detected_hz=round(peak_hz, 2), cents_from_written=cents))
        mismatched = [row for row in detections if abs(row['cents_from_written']) > 45]
        if mismatched:
            raise ValueError(f'Solo pitch check mismatch: {mismatched}')
        result['solo_fft_pitch_checks'] = detections
    del pcm
    return result


def render_study(out, sources, cache, owner):
    lock_identity = engine.owner_state(owner)
    started = time.monotonic()
    harmony, lead, notes, samples = compose()
    solo = [note for note in notes if note['part'] == 'marimba']
    written_frames = expected_lead(lead, BEAT * RATE)
    written_ticks = expected_lead(lead, PPQ)
    midi = engine_score.midi(notes)
    if midi_lead(midi) != written_ticks:
        raise ValueError('Written lead and emitted MIDI note pairs differ')
    for name, expected in engine.HASHES.items():
        if engine.sha(cache/name) != expected:
            raise ValueError(f'Unexpected input identity: {name}')
    out.mkdir(parents=True, exist_ok=True)
    artifact_names = [*FILES.values(), 'score.mid', 'arrangement.json', 'qc.json']
    if any((out/name).exists() for name in artifact_names):
        raise ValueError('Choose a fresh output directory to preserve the existing study')

    with tempfile.TemporaryDirectory(prefix='.v3-study-', dir=out) as temp:
        scratch = Path(temp)
        by_variant = {}
        gain = None
        for key, arrangement in [('full', notes), ('solo', solo)]:
            print(f'Rendering {key}: {len(arrangement)} notes', flush=True)
            work = scratch/key
            work.mkdir()
            pcm = engine.premaster(work, cache, sources, arrangement, FRAMES, samples if key == 'full' else [])
            aux = work/'aux.tsv'
            if actual_aux_lead(aux) != written_frames:
                raise ValueError(f'Written lead and {key} synth note pairs differ')
            source = ['-f', 'f32le', '-ar', RATE, '-ac', 2, '-i', pcm]
            if gain is None:
                master = engine.meter(source)
                gain = min(-20.26 - master['i'], -3.0 - master['tp'])
            path = scratch/FILES[key]
            title = 'Morning on the Boardwalk v3 - ' + ('16-bar study' if key == 'full' else 'melody only')
            engine.run(engine.FF + ['-v', 'error'] + source + ['-af', f'volume={gain:.6f}dB', '-c:a',
                       'libmp3lame', '-b:a', '160k', '-metadata', f'title={title}', path])
            pcm.unlink()
            decoded = work/'decoded.f32'
            by_variant[key] = verify_mp3(path, lead, key == 'solo', decoded)
            decoded.unlink()
            by_variant[key]['aux_event_tsv_sha256'] = engine.sha(aux)

        (scratch/'score.mid').write_bytes(midi)
        engine.write_json(scratch/'arrangement.json', dict(
            bpm=BPM, bars=BARS, sample_rate=RATE, frames=FRAMES, harmony=harmony,
            note_counts=Counter(note['part'] for note in notes), notes=notes))
        engine.write_json(scratch/'qc.json', dict(
            status='offline event and audio checks only; no subjective listening acceptance',
            sources=dict(lead_sheet_sha256=engine.sha(DRAFT), soundfont_and_header=engine.HASHES,
                         guitar={name:engine_score.SEED['samples'][name] for name in samples},
                         scripts={path.name:engine.sha(path) for path in
                                  [Path(__file__), Path(engine.__file__), Path(engine.__file__).with_name('aux.c'),
                                   Path(engine_score.__file__), Path(engine_score.__file__).with_name('v2-seed.json'),
                                   Path(__file__).with_name('study_score.py'), Path(__file__).with_name('check_phrase.py')]}),
            notes_checked=dict(midi_on_and_off=len(written_ticks), full_and_solo_aux_on_and_off_each=len(written_frames),
                               solo_pcm_written_pitch_windows=len(lead)),
            full_and_solo_linear_gain_db=round(gain, 6), variants=by_variant,
            files={name:dict(bytes=(scratch/name).stat().st_size, sha256=engine.sha(scratch/name))
                   for name in artifact_names[:-1]},
            elapsed_seconds=round(time.monotonic()-started, 2)))
        if engine.owner_state(owner) != lock_identity:
            raise ValueError('Heavy window ownership changed')
        for name in artifact_names:
            os.link(scratch/name, out/name)
    print(json.dumps({key:{field:qc[field] for field in ('seconds','integrated_lufs','true_peak_dbtp','clipped_samples',
                                                         'bars_below_minus_55_dbfs')} for key,qc in by_variant.items()}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=OUT)
    parser.add_argument('--sources', type=Path, default=SOURCES)
    parser.add_argument('--cache', type=Path, default=engine.CACHE)
    parser.add_argument('--lock-owner', required=True)
    args = parser.parse_args()
    try:
        render_study(args.out.resolve(), args.sources.resolve(), args.cache.resolve(), args.lock_owner)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors='replace')[-2500:]) from error


if __name__ == '__main__':
    main()
