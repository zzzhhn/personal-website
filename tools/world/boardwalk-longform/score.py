"""Symbolic score for the extended Boardwalk arrangement. Stdlib only."""
from __future__ import annotations

import json
from pathlib import Path
import struct

RATE, BPM, PPQ = 44100, 82, 960
BEAT, BARS, TAIL = 60 / BPM, 171, 1.7
STRINGS = ('LowE', 'A', 'D', 'G', 'B', 'HighE')
PARTS = {'guitar': (0, 25), 'bass': (1, 32), 'marimba': (2, 12), 'celesta': (3, 8), 'brush': (9, 40)}
SEED = json.loads(Path(__file__).with_name('v2-seed.json').read_text())
VOICINGS = {
    'C6':    (36, (None, 48, 52, 57, 60, 64)),
    'Am7':   (33, (None, 45, 52, 55, 60, 64)),
    'Fmaj7': (29, (None, None, 53, 57, 60, 64)),
    'G6':    (31, (43, 47, 50, 55, 59, 64)),
    'C/E':   (28, (40, None, 52, 55, 60, 64)),
    'Dm7':   (38, (None, None, 50, 57, 60, 65)),
    'G7':    (31, (43, 47, 50, 55, 59, 65)),
    'Em7':   (28, (40, None, 52, 55, 59, 64)),
    'C/G':   (31, (43, 48, 52, 55, 60, 64)),
}
OPENING = 'C6 Am7 Fmaj7 G6 C/E Dm7 G7 C6'
# Ten composed 16-bar passages. Each / divides a question/answer cell.
# lead controls melodic register, brush controls density, and the finger patterns
# change position and rhythm without moving the quarter-note pulse.
CHAPTERS = [
    ('木板路', 'C6 C/E Fmaj7 G6 / Am7 Em7 Fmaj7 G6 / C6 Am7 Dm7 G7 / Fmaj7 C/E G7 C6', 'walk', 'theme', 'soft'),
    ('朝潮', 'Am7 C/E Dm7 G6 / Am7 Em7 Fmaj7 C/G / Dm7 Am7 Fmaj7 G7 / C/E Fmaj7 G6 C6', 'roll', 'tide', 'sparse'),
    ('石阶', 'Fmaj7 C/E Dm7 Am7 / Fmaj7 G6 C/E C6 / Fmaj7 Em7 Dm7 G7 / Am7 Fmaj7 G6 C6', 'open', 'low', 'rest'),
    ('坡上的风', 'C6 G6 Am7 Em7 / Fmaj7 C/E Dm7 G6 / C6 C/E Fmaj7 Em7 / Dm7 Am7 G7 C6', 'lift', 'rise', 'soft'),
    ('避风处', 'Am7 Em7 Am7 C/E / Fmaj7 C/E Dm7 G6 / Em7 Am7 Fmaj7 C/G / Dm7 Fmaj7 G6 C6', 'open', 'air', 'rest'),
    ('回到海边', 'C6 Am7 Fmaj7 G6 / C/E Dm7 G7 C6 / C6 Em7 Am7 Fmaj7 / Dm7 C/E G7 C6', 'walk', 'reprise', 'soft'),
    ('浅水', 'Dm7 Am7 Fmaj7 C/E / Dm7 Fmaj7 G6 C6 / Am7 C/E Fmaj7 Am7 / Dm7 C/G G7 C6', 'roll', 'answer', 'sparse'),
    ('长椅', 'Fmaj7 C/E Am7 Em7 / Fmaj7 Dm7 G6 C6 / C/E Am7 Dm7 C/G / Fmaj7 C/E G6 C6', 'open', 'low', 'rest'),
    ('海岸回望', 'C6 C/E Fmaj7 G6 / Am7 Em7 Dm7 G7 / C6 G6 Am7 Fmaj7 / C/E Dm7 G7 C6', 'lift', 'home', 'soft'),
    ('放慢脚步', 'Am7 Fmaj7 C/E G6 / C6 C/E Dm7 G6 / Fmaj7 Am7 Dm7 C/G / Fmaj7 C/E G6 C6', 'settle', 'air', 'sparse'),
]
CODA = 'Fmaj7 G6 C6'
# A small family of motifs. Every cell starts, answers, then leaves space.
LEADS = {
    'theme':   [(0.5, 76, .5), (1, 74, .5), (1.5, 72, 1), (2.75, 67, .75)],
    'tide':    [(0, 72, 1), (1.5, 69, .5), (2.5, 67, 1)],
    'low':     [(0.5, 64, 1), (2, 67, .5), (2.5, 69, 1)],
    'rise':    [(0, 67, .75), (1, 72, .75), (2, 74, .5), (2.5, 76, 1)],
    'air':     [(1, 72, 1), (2.5, 76, 1)],
    'reprise': [(0.5, 76, .5), (1, 74, .5), (1.5, 72, 1), (2.75, 67, .75)],
    'answer':  [(0.5, 65, .5), (1.25, 69, .75), (2.5, 72, 1)],
    'home':    [(0.5, 76, .5), (1.5, 74, .75), (2.75, 72, 1)],
}
CHORD_TONES = {
    'C6': (0, 4, 7, 9), 'Am7': (9, 0, 4, 7), 'Fmaj7': (5, 9, 0, 4),
    'G6': (7, 11, 2, 4), 'C/E': (0, 4, 7), 'Dm7': (2, 5, 9, 0),
    'G7': (7, 11, 2, 5), 'Em7': (4, 7, 11, 2), 'C/G': (0, 4, 7),
}


def compose():
    notes = [n.copy() for n in SEED['notes']]
    sections = [{'name': '原主题', 'bar': 1, 'harmony': OPENING.split()}]

    def add(part, bar, beat, pitch, gate, vel, *, string=None, layer=None, stroke=None, delay=0):
        row = dict(part=part, bar=bar + 1, beat=beat + 1, pitch=pitch,
                   start=round((bar * 4 + beat) * BEAT + delay, 7),
                   duration=round(gate * BEAT, 7), velocity=vel)
        if string is not None:
            row.update(string=STRINGS[string], layer=layer, stroke=stroke)
        notes.append(row)

    def guitar(bar, voicing, beat, string, gate, vel, stroke, delay=0):
        pitch = voicing[string]
        if pitch is None:
            raise ValueError('unvoiced guitar string')
        layers = [i for i in (1, 2) if sample_name(STRINGS[string], pitch, i) in SEED['samples']]
        if not layers:
            raise ValueError((bar + 1, STRINGS[string], pitch))
        layer = min(layers, key=lambda i: abs(i - (1 if vel <= 48 else 2)))
        add('guitar', bar, beat, pitch, gate, min(48, vel) if layer == 1 else max(49, vel),
            string=string, layer=layer, stroke=stroke, delay=delay)

    def nearest(chord, target):
        return min((pitch for pitch in range(60, 82) if pitch % 12 in CHORD_TONES[chord]),
                   key=lambda pitch: (abs(pitch - target), pitch))

    for chapter, (name, harmony, texture, lead, brush) in enumerate(CHAPTERS):
        start = 8 + chapter * 16
        chords = harmony.replace(' / ', ' ').split()
        if len(chords) != 16:
            raise ValueError(name)
        sections.append(dict(name=name, bar=start+1, harmony=chords, texture=texture, lead=lead, brush=brush))
        for i, chord in enumerate(chords):
            bar, cell, role = start + i, i // 4, i % 4
            root, voicing = VOICINGS[chord]
            strings = [s for s, pitch in enumerate(voicing) if pitch is not None]
            thumb, middle, top = strings[0], strings[1], strings[-1]
            # Start after the v2 opening's ringing chord, at beat two of bar nine.
            if bar == 8:
                guitar(bar, voicing, 1, thumb, 2.8, 56, 'thumb')
                guitar(bar, voicing, 2.5, strings[-2], 1.25, 42, 'finger')
            else:
                guitar(bar, voicing, 0, thumb, 2.0, 61 if texture in ('walk','lift') else 55, 'thumb')
                if texture in ('roll', 'lift') or (texture == 'walk' and role in (0, 2)):
                    for beat, string, vel in [(0.5, middle, 43), (1, strings[-3], 43),
                                              (1.5 if role != 2 else 1.75, strings[-2], 39)]:
                        guitar(bar, voicing, beat, string, 1.85, vel, 'finger')
                    if role != 3:
                        guitar(bar, voicing, 2.5 if cell % 2 == 0 else 2.75, top, 1.18, 42, 'finger')
                elif role in (0, 2):
                    guitar(bar, voicing, 1.25 if texture == 'open' else 1, middle, 2.35, 40, 'finger')
                    guitar(bar, voicing, 2.75, top, 1.12, 42, 'finger')
                elif role == 1 and texture == 'walk':
                    for j, s in enumerate(strings[-3:][::-1]):
                        guitar(bar, voicing, 1, s, .92, 45 - 3*j, 'soft-up', .012*j)
                else:
                    guitar(bar, voicing, 1.5, strings[-2], 2.25, 40, 'finger')
                if texture in ('walk','lift','roll') and role != 3:
                    guitar(bar, voicing, 2, thumb, 1.72, 52, 'thumb')
                if role == 3 or (texture == 'lift' and role == 1):
                    for j, s in enumerate(strings[-3:]):
                        guitar(bar, voicing, 3, s, .86, 44-3*j, 'soft-down', .014*j)

            # Leave more air in the bass and brush arrangement, especially on the reduced middle passages.
            add('bass', bar, 1 if bar == 8 else 0, root, 2.6 if brush == 'rest' or role == 3 else 1.65,
                56 if texture in ('open','settle') else 61)
            if role in (0, 2) and brush != 'rest' and bar != 8:
                add('bass', bar, 2, root if chord == 'Dm7' else root + 7, 1.3, 49)
            if (chapter, i) in ((0, 14), (3, 14), (5, 6), (8, 14)):
                add('bass', bar, 3.5, 35, .34, 39)
            if brush == 'soft' and bar != 8:
                for beat in ([0, 2] if role in (0, 2) else [0]):
                    add('brush', bar, beat, 36, .18, 36 if beat == 0 else 29)
                for beat in ([1, 3] if role != 3 else [1]):
                    add('brush', bar, beat, 38, .32, 32 if beat == 1 else 26, delay=.006)
                for beat in ([0, 1, 2] if role in (0, 2) else [0, 2]):
                    add('brush', bar, beat, 44, .16, 22 if beat % 2 == 0 else 18)
            elif brush == 'sparse' and role in (0, 2) and (chapter != 9 or i < 8):
                add('brush', bar, 0, 36, .16, 31)
                add('brush', bar, 1, 38, .31, 27, delay=.006)
                if role == 0:
                    add('brush', bar, 2, 44, .16, 19)

            if role == 0 and bar != 8 and not (lead == 'air' and cell % 2 == 0):
                motif = LEADS[lead]
                if cell == 2 and lead in ('theme','reprise','rise','home'):
                    motif = [(b, p, g) for b, p, g in motif if b < 2.5]
                for j, (beat, pitch, gate) in enumerate(motif):
                    # First theme returns over C; elsewhere chord tones shape the opening
                    # and landing while the inner notes keep their original stepwise contour.
                    if (lead == 'reprise' and cell == 0) or (chord.startswith('C') and lead == 'theme'):
                        tuned = pitch
                    elif j == 0 or j == len(motif)-1:
                        tuned = nearest(chord, pitch)
                    else:
                        tuned = pitch
                    add('marimba', bar, beat, tuned, max(1.6, gate), 59 - 2*j - (5 if lead in ('air','low') else 0), delay=.004)
            if role == 1 and (cell % 2 == 0 or lead not in ('air','low')):
                targets = (69, 67) if cell % 2 == 0 else (72, 64)
                if lead in ('rise','home') and cell in (1, 2):
                    targets = (76, 72)
                for beat, target, vel in [(0.75, targets[0], 51), (2.5, targets[1], 45)]:
                    add('marimba', bar, beat, nearest(chord, target), 1.6, vel, delay=.004)
            if role == 2 and cell in ((0, 2) if lead in ('air','low') else (1, 3)):
                # A quiet upper reply occupies a melodic rest.
                p = nearest(chord, 79 if cell < 2 else 76)
                add('celesta', bar, 2.25, p, 1.18, 33)
                add('celesta', bar, 3.25, nearest(chord, p-3), .74, 28)
            if role == 3 and (cell in (1, 3) or lead == 'reprise') and (chapter != 9 or cell < 3):
                add('marimba', bar, .5, nearest(chord, 67 if cell < 3 else 72), 2.1, 47, delay=.004)

    sections.append(dict(name='余响', bar=169, harmony=CODA.split()))
    for bar, chord in enumerate(CODA.split(), 168):
        root, voicing = VOICINGS[chord]
        strings = [s for s, pitch in enumerate(voicing) if pitch is not None]
        if bar < 170:
            guitar(bar, voicing, 0, strings[0], 2.6, 56, 'thumb')
            for j, s in enumerate(strings[-3:]):
                guitar(bar, voicing, 1.5, s, 2.37, 43-j*3, 'soft-down', .016*j)
            add('marimba', bar, 1, 69 if bar == 168 else 67, 1.6, 46, delay=.004)
        else:
            for j, s in enumerate(strings):
                guitar(bar, voicing, 0, s, 4.8, 61-j*3, 'final-down', .016*j)
            add('marimba', bar, 0, 72, 3, 49, delay=.004)
        add('bass', bar, 0, root, 3.6 if bar == 170 else 2.3, 56)

    notes.sort(key=lambda n: (n['start'], n['part'], n.get('string', ''), n['pitch']))
    previous = {}
    for note in notes:
        key = identity(note)
        old = previous.get(key)
        if old and old['start'] + old['duration'] > note['start'] - .003:
            old['duration'] = round(note['start'] - .003 - old['start'], 7)
        previous[key] = note
    frames = round((BARS * 4 * BEAT + TAIL) * RATE)
    if [n for n in notes if n['bar'] <= 8] != SEED['notes']:
        raise ValueError('Original opening notes changed')
    if any(n['duration'] <= .001 or round((n['start']+n['duration'])*RATE) >= frames for n in notes):
        raise ValueError('Note ends outside render interval or has an invalid gate')
    return notes, sections, frames


def identity(note):
    return note['part'], note['string'] if note['part'] == 'guitar' else note['pitch']


def sample_name(string, pitch, layer):
    chromatic = ('C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B')
    return f'INSGuitarSteel_String{string}_Vel{layer:02}_{chromatic[pitch%12]}{pitch//12-1}_01.ogg'


def channel_of(note):
    if note['part'] == 'guitar':
        return (0, 4, 5, 6, 7, 8)[STRINGS.index(note['string'])]
    return PARTS[note['part']][0]


def events(notes, frame_at):
    return sorted((frame_at(t), on, channel_of(n), n['pitch'], n['velocity'] if on else 0)
                  for n in notes for on, t in ((1, n['start']), (0, n['start'] + n['duration'])))


def vlq(value):
    out = [value & 127]
    while value >> 7:
        value >>= 7
        out.insert(0, (value & 127) | 128)
    return bytes(out)


def midi(notes):
    def track(rows):
        data, previous = bytearray(), 0
        for tick, order, payload in sorted(rows):
            data.extend(vlq(tick-previous) + payload)
            previous = tick
        data.extend(b'\0\xff\x2f\0')
        return b'MTrk' + struct.pack('>I', len(data)) + data

    tracks = [track([(0, 0, b'\xff\x51\x03'+round(60000000/BPM).to_bytes(3,'big')),
                     (0, 1, b'\xff\x58\x04\x04\x02\x18\x08')])]
    tracks_by_channel = {(0, 4, 5, 6, 7, 8)[i]: (f'guitar {s}', 25) for i, s in enumerate(STRINGS)}
    tracks_by_channel.update({ch: (part, program) for part, (ch, program) in PARTS.items() if part != 'guitar'})
    timeline = events(notes, lambda t: round(t / BEAT * PPQ))
    for channel, (part, program) in sorted(tracks_by_channel.items()):
        title = part.encode()
        rows = [(0, -2, b'\xff\x03' + vlq(len(title)) + title), (0, -1, bytes((0xc0+channel, program)))]
        rows.extend((at, on, bytes(((0x90 if on else 0x80)+ch, pitch, vel)))
                    for at, on, ch, pitch, vel in timeline if ch == channel)
        tracks.append(track(rows))
    return b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), PPQ) + b''.join(tracks)
