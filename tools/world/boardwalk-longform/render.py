#!/usr/bin/env python3
"""Prepare symbolic artifacts, or render once under the coordinator's heavy lock."""
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import time

os.environ['OPENBLAS_NUM_THREADS'] = os.environ['OMP_NUM_THREADS'] = '1'
import score

RATE, BLOCK = score.RATE, 8192
HERE = Path(__file__).resolve().parent
CACHE = Path.home() / 'Library/Caches/bobby-world-audio'
LOCK = Path('/tmp/bobby-world-phase2-heavy.lock/owner.json')
SF2, TSF = 'GeneralUser-GS-2.0.3.sf2', 'tsf.h'
HASHES = {
    SF2: '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe',
    TSF: '70d55963c98f60ebb81518eaa1f25d46888d5180eb5f5289fd6b74ffc177d197',
}
FF = ['ffmpeg', '-hide_banner', '-nostdin', '-threads', '1', '-filter_threads', '1']
TITLE = 'Morning on the Boardwalk (Long Version)'
MIX = {
    'guitar': (75, 11000, 1.5, 0), 'bass': (30, 4500, 1.8, 0),
    'marimba': (170, 9000, 1.75, .1), 'celesta': (500, 7500, 2.4, .32),
    'brush': (60, 12000, 1.5, -.08),
}


def sha(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def put(path, contents):
    if path.exists():
        if path.read_bytes() != contents:
            raise ValueError(f'Preserve existing artifact: {path}')
    else:
        path.write_bytes(contents)


def write_json(path, data):
    put(path, (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode())


def run(command):
    return subprocess.run([str(x) for x in command], capture_output=True, check=True)


def meter(args):
    measured = run(FF + args + ['-af', 'loudnorm=I=-20.26:TP=-2.5:LRA=11:print_format=json',
                                '-f', 'null', '-']).stderr.decode()
    obj = json.loads(measured[measured.rfind('{'):measured.rfind('}')+1])
    return {key.removeprefix('input_'): float(val) for key, val in obj.items() if key.startswith('input_')}


def owner_state(owner):
    if not owner or not LOCK.exists():
        raise ValueError('Wait for coordinator window and pass its exact lock owner')
    inode = LOCK.stat().st_ino
    current = json.loads(LOCK.read_text())
    if current.get('owner') != owner:
        raise ValueError('Wait for coordinator window and pass its exact lock owner')
    return inode, current


def prepare(out):
    notes, sections, frames = score.compose()
    total = frames / RATE
    parts = Counter(n['part'] for n in notes)
    for i, section in enumerate(sections):
        section['start_seconds'] = round((section['bar']-1)*4*score.BEAT, 6)
        end_bar = sections[i+1]['bar'] if i+1 < len(sections) else score.BARS+1
        section['end_seconds'] = round((end_bar-1)*4*score.BEAT, 6) if end_bar <= score.BARS else total
        section['notes_per_part'] = dict(Counter(n['part'] for n in notes if section['bar'] <= n['bar'] < end_bar))
    used = {score.sample_name(n['string'], n['pitch'], n['layer']) for n in notes if n['part'] == 'guitar'}
    if not used <= score.SEED['samples'].keys():
        raise ValueError('Arrangement needs an unreviewed guitar sample')
    # Check at both audio and MIDI rounding boundaries.
    for at in (lambda t: round(t*RATE), lambda t: round(t/score.BEAT*score.PPQ)):
        held = set()
        for _, on, ch, key, _ in score.events(notes, at):
            identity = ch, key
            if (identity in held) == bool(on):
                raise ValueError(f'Invalid repeated note or unmatched note-off: {identity}')
            if on:
                held.add(identity)
            else:
                held.remove(identity)
        if held:
            raise ValueError('Unreleased notes')
    out.mkdir(parents=True, exist_ok=True)
    write_json(out/'arrangement.json', dict(title=TITLE, bpm=score.BPM, meter='4/4', key='C major',
               frames=frames, sample_rate=RATE, seconds=total, bars=score.BARS, sections=sections,
               note_counts=parts, opening_score_unchanged=True, samples=sorted(used), notes=notes))
    put(out/'score.mid', score.midi(notes))
    return notes, sections, frames, sorted(used)


def premaster(scratch, cache, sources, notes, frames, names):
    import numpy as np
    from scipy import signal

    samples = {}
    for name in names:
        path = sources / name
        if sha(path) != score.SEED['samples'][name]['sha256']:
            raise ValueError(f'Wrong guitar source: {name}')
        raw = run(FF + ['-v', 'error', '-i', path, '-t', '22.01', '-f', 'f32le', '-ar', RATE, '-ac', 1, 'pipe:1'])
        pcm = np.frombuffer(raw.stdout, dtype='<f4').copy()
        if not (31 <= len(pcm) <= RATE*22) or not np.isfinite(pcm).all():
            raise ValueError(f'Bad guitar decode: {name}')
        pcm[:31] *= np.linspace(0, 1, 31, dtype=np.float32)
        samples[name] = pcm

    binary, events, raw_out = (scratch / p for p in ('aux', 'aux.tsv', 'premaster.f32'))
    run(['clang', '-O2', '-I', cache, HERE/'aux.c', '-o', binary, '-lm'])
    events.write_text(''.join('\t'.join(map(str, event))+'\n' for event in
                              score.events([n for n in notes if n['part'] != 'guitar'], lambda t: round(t*RATE))))
    guitar = []
    for n in notes:
        if n['part'] != 'guitar':
            continue
        name = score.sample_name(n['string'], n['pitch'], n['layer'])
        at = round(n['start']*RATE)
        length = min(len(samples[name]), round(n['duration']*RATE), frames-at)
        angle = (.36 + score.STRINGS.index(n['string'])*.012) * math.pi/2
        lo, hi = {1:(1,48), 2:(49,96)}[n['layer']]
        amplitude = .708 + .292 * (n['velocity']-lo)/(hi-lo)
        guitar.append((at, length, samples[name], amplitude*np.array([math.cos(angle), math.sin(angle)], np.float32)))

    filters, states = {}, {}
    for part, (high, low, _, _) in MIX.items():
        filters[part] = np.vstack([signal.butter(2, f, btype=kind, fs=RATE, output='sos')
                                   for kind, f in [('highpass', high), ('lowpass', low)]])
        states[part] = np.zeros((2, 2, 2))
    delays = [(round(t*RATE), gain) for t, gain in [(.023,.035), (.041,.02)]]
    history = np.zeros((max(d for d, _ in delays), 2), np.float32)
    cursor, ringing = 0, []
    release = round(.05*RATE)
    fade = round(.65*RATE)
    process = subprocess.Popen([binary, cache/SF2, events, str(frames)], stdout=subprocess.PIPE)
    try:
        with raw_out.open('wb') as target:
            for start in range(0, frames, BLOCK):
                end = min(frames, start+BLOCK)
                count = end-start
                block = process.stdout.read(4*count*2*4)
                if len(block) != 4*count*2*4:
                    raise ValueError(f'Aux stream ended early at frame {start}, status {process.wait()}')
                aux = np.frombuffer(block, dtype='<f4').reshape(4, count, 2)
                dry = np.zeros((count, 2), np.float32)
                g = np.zeros_like(dry)
                ringing = [note for note in ringing if note[0]+note[1] > start]
                while cursor < len(guitar) and guitar[cursor][0] < end:
                    ringing.append(guitar[cursor])
                    cursor += 1
                for at, length, sample, scale in ringing:
                    begin = max(at, start)
                    finish = min(at+length, end)
                    pos = np.arange(begin-at, finish-at, dtype=np.float32)
                    env = np.clip((length-1-pos) / (min(length, release)-1), 0, 1)
                    g[begin-start:finish-start] += (sample[begin-at:finish-at]*env)[:, None]*scale
                for i, (part, (_, _, trim, pan)) in enumerate(MIX.items()):
                    if part == 'guitar':
                        stem = g
                    else:
                        theta = (pan+1)*math.pi/4
                        stem = aux[i-1].mean(axis=1)[:, None]*np.array([math.cos(theta), math.sin(theta)], np.float32)
                    filtered, states[part] = signal.sosfilt(filters[part], stem, axis=0, zi=states[part])
                    dry += filtered.astype(np.float32)*trim
                delayed = np.vstack((history, dry))
                mixed = dry.copy()
                for delay, gain in delays:
                    offset = len(history)-delay
                    mixed += delayed[offset:offset+count, ::-1]*gain
                history = delayed[-len(history):].copy()
                if end > frames-fade:
                    tail = max(start, frames-fade)
                    mixed[tail-start:] *= ((frames-1-np.arange(tail, end))/(fade-1))[:, None]**2
                if not np.isfinite(mixed).all():
                    raise ValueError(f'Non-finite premaster at {start}')
                target.write(mixed.astype('<f4', copy=False).tobytes())
        if process.stdout.read(1) or process.wait():
            raise ValueError('Unexpected extra aux frames or process error')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdout.close()
    return raw_out


def decoded_qc(path, sections, expected):
    import numpy as np

    def db(x):
        return round(20*math.log10(max(float(x), 1e-12)), 3)

    # Use a 50 ms grid. Track aggregate power and exact decoded frame count;
    # retain only small neighborhoods around the twelve musical boundaries.
    cuts = sorted(set([0, expected] + [round(s['start_seconds']*RATE) for s in sections]))
    neighborhoods = {cut: [] for cut in cuts}
    step = RATE//20
    total = quiet = longest = 0
    power = peak = 0.0
    quiet_ranges = []
    process = subprocess.Popen(FF+['-v','error','-i',str(path),'-f','f32le','-ac','2','-ar',str(RATE),'pipe:1'],
                               stdout=subprocess.PIPE)
    try:
        while raw := process.stdout.read(step * 2 * 4):
            block = np.frombuffer(raw, dtype='<f4').reshape(-1, 2)
            end = total + len(block)
            if not np.isfinite(block).all() or end > expected:
                raise ValueError('Decoded frames invalid')
            level = float(np.einsum('ij,ij->', block, block, dtype=np.float64))
            power += level
            peak = max(peak, float(np.max(np.abs(block))))
            if level/(2*len(block)) < 10**(-55/10):
                quiet += len(block)
                longest = max(longest, quiet)
            elif quiet:
                quiet_ranges.append((total-quiet, total))
                quiet = 0
            for cut, history in neighborhoods.items():
                if total < cut + step and end > cut - step:
                    history.append(block[max(0, cut-step-total):min(len(block), cut+step-total)].copy())
            total = end
        if process.wait() or total != expected:
            raise ValueError(f'Expected {expected} decoded frames; got {total}')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        process.stdout.close()
    if quiet:
        quiet_ranges.append((total-quiet, total))
    longest_interior = max((end-start for start, end in quiet_ranges if start and end != total), default=0)
    if peak >= 1 or longest_interior > RATE*1.8:
        raise ValueError(f'Peak overflow or extended interior quiet: {peak}, {longest_interior/RATE}s')
    boundaries = []
    for right in cuts[1:]:
        before = np.vstack(neighborhoods[right])[:step]
        if right == expected:
            after = np.vstack(neighborhoods[0])
        else:
            after = np.vstack(neighborhoods[right])[-step:]
        crossing = np.max(np.abs(after[0]-before[-1]))
        boundaries.append(dict(at_seconds=round(right/RATE, 6), last_to_first=right == expected,
                               before_rms_dbfs=db(np.sqrt(np.mean(before**2))),
                               after_rms_dbfs=db(np.sqrt(np.mean(after**2))), sample_jump_dbfs=db(crossing)))
    if any(b['sample_jump_dbfs'] > -12 for b in boundaries):
        raise ValueError('Large sample jump at a section boundary or whole-file repeat')
    return dict(decoded_frames=total, seconds=total/RATE, rms_dbfs=db(math.sqrt(power/(2*total))),
                sample_peak_dbfs=db(peak), below_minus_55_dbfs_grid_seconds=.05,
                longest_quiet_seconds=longest/RATE, longest_interior_quiet_seconds=longest_interior/RATE,
                tail_quiet_seconds=(total-quiet_ranges[-1][0])/RATE if quiet_ranges and quiet_ranges[-1][1] == total else 0,
                boundaries=boundaries)


def render(out, sources, cache, owner):
    lock_identity = owner_state(owner)
    master_name, report_name = 'boardwalk-longform.mp3', 'qc.json'
    excerpts = [('01-theme.mp3', 0, 21), ('02-shelter.mp3', 226, 19), ('03-return.mp3', 398, 20)]
    for name in (master_name, report_name, *(item[0] for item in excerpts)):
        if (out/name).exists():
            raise ValueError(f'Preserve completed render: {out/name}')
    for name, expected in HASHES.items():
        if sha(cache/name) != expected:
            raise ValueError(f'Unexpected input hash: {name}')
    notes, sections, frames, names = prepare(out)
    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='.longform-', dir=out) as temp:
        scratch = Path(temp)
        print('Rendering 8192-frame blocks', flush=True)
        pcm = premaster(scratch, cache, sources, notes, frames, names)
        source = ['-f', 'f32le', '-ar', RATE, '-ac', 2, '-i', pcm]
        print('Measuring and encoding one linear master', flush=True)
        before = meter(source)
        gain = min(-20.26 - before['i'], -3.15 - before['tp'])
        encoded = scratch/master_name
        run(FF+['-v','error']+source+['-af',f'volume={gain:.6f}dB','-c:a','libmp3lame','-b:a','160k',
                                    '-metadata',f'title={TITLE}',encoded])
        after = meter(['-i', encoded])
        if not (-22.5 <= after['i'] <= -19.25) or after['tp'] > -2:
            raise ValueError(f'Encoded master outside expected loudness or peak budget: {after}')
        decoded = decoded_qc(encoded, sections, frames)
        for name, at, duration in excerpts:
            run(FF+['-v','error','-ss',at,'-i',encoded,'-t',duration,
                    '-af',f'afade=t=out:st={duration-.45:.2f}:d=0.45','-c:a','libmp3lame','-b:a','128k',scratch/name])
        files = {p.name: dict(bytes=p.stat().st_size, sha256=sha(p))
                 for p in [encoded, *(scratch/item[0] for item in excerpts), out/'arrangement.json', out/'score.mid']}
        write_json(scratch/report_name, dict(
            status='numerically verified offline; no creative listening or runtime check',
            title=TITLE, version='longform', source_v2_wav_sha256=score.SEED['source_runtime_wav_sha256'],
            source_v2_score_sha256=score.SEED['source_score_sha256'], source_v2_sample_plan_sha256=score.SEED['source_plan_sha256'],
            source_hashes={name:sha(HERE/name) for name in ['score.py','render.py','aux.c','v2-seed.json']},
            audio_inputs=dict(soundfont_and_header=HASHES, guitar={name:score.SEED['samples'][name] for name in names}),
            reference_audio_used=False, bpm=score.BPM, bars=score.BARS, block_frames=BLOCK, pre=before,
            linear_gain_db=round(gain, 6), encoded=after, decoded=decoded,
            listening_excerpts=[dict(file=n, start_seconds=t, seconds=d) for n,t,d in excerpts],
            files=files, elapsed_seconds=round(time.monotonic()-start, 2)))
        if owner_state(owner) != lock_identity:
            raise ValueError('Coordinator lock changed while rendering')
        for name in (master_name, *(item[0] for item in excerpts), report_name):
            os.link(scratch/name, out/name)  # Publish without overwriting another result.
    print(json.dumps(dict(output=str(out/master_name), bytes=files[master_name]['bytes'],
                          seconds=frames/RATE, lufs=after['i'], dbtp=after['tp'])), flush=True)


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--prepare', action='store_true')
    modes.add_argument('--render', action='store_true')
    parser.add_argument('--sources', type=Path, help='v2 source-samples folder (19 reviewed OGGs)')
    parser.add_argument('--cache', type=Path, default=CACHE)
    parser.add_argument('--lock-owner')
    args = parser.parse_args()
    try:
        if args.prepare:
            notes, sections, frames, names = prepare(args.output)
            print(json.dumps(dict(bars=score.BARS, notes=len(notes), sections=len(sections), frames=frames,
                                  seconds=frames/RATE, samples=len(names), audio_rendered=False)))
        elif not args.sources:
            parser.error('--render requires --sources')
        else:
            render(args.output, args.sources, args.cache, args.lock_owner)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors='replace')[-2500:]) from error


if __name__ == '__main__':
    main()
