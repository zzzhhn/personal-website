"""Reproducible, pitch-preserving Club selects from the local Hepai CC BY catalogue.
Source originals are never modified. Run one FFmpeg job at a time.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('/Users/a22309/Desktop/AI 比赛/腾讯音乐 AI Hackathon/合拍/backend/data/audio_cc')
DEST = ROOT / 'public/assets/world/club/audio'
TRACKS = [
    ('Backbay Lounge', 'backbay-lounge', 120, 12.03),
    ('Disco con Tutti', 'disco-con-tutti', 115, 4.194782608695652),
]
records = []
for title, name, bpm, start in TRACKS:
    source = SOURCE / f'Kevin MacLeod - {title}.mp3'
    duration = 64 * 60 / bpm
    samples = round(64 * 60 / 118 * 32000)
    filters = f'atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS,atempo={118 / bpm},loudnorm=I=-18:TP=-1.5:LRA=9,aresample=32000,apad,atrim=end_sample={samples},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={samples / 32000 - .008}:d=0.008'
    destination = DEST / f'{name}-club.mp3'
    subprocess.run(['/opt/homebrew/bin/ffmpeg', '-v', 'warning', '-y', '-i', str(source), '-af', filters,
                    '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1',
                    '-metadata', f'title={title} (DJC Club edit)', '-metadata', 'artist=Kevin MacLeod',
                    '-metadata', 'TBPM=118', '-write_xing', '1', str(destination)], check=True)
    records.append({'title': title, 'artist': 'Kevin MacLeod', 'license': 'CC BY 4.0',
                    'source_file': source.name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'source_bpm': bpm, 'source_start_seconds': start, 'source_duration_seconds': duration,
                    'output_bpm': 118, 'beats': 64, 'output_samples': samples, 'sample_rate': 32000, 'processing': filters,
                    'output_file': destination.name, 'output_sha256': hashlib.sha256(destination.read_bytes()).hexdigest()})
(DEST / 'club-edits.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps({'prepared': len(records), 'beats_per_select': 64, 'bpm': 118}))
