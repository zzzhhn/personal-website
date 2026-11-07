"""Expand the written A/B/C score and its stated reprises, with fixed accompaniment."""
from collections import defaultdict
from dataclasses import replace
from fractions import Fraction

from check_phrase import DRAFT, Note, check, read_lead_sheet
from study_score import BEAT, DRUMS, RATE, check_polyphony, compose as compose_a, engine_score, midi_pitch

PLAN = DRAFT.with_name('longform-plan.md')
THEMES = {'A': DRAFT, 'B': DRAFT.with_name('theme-b.md'), 'C': DRAFT.with_name('theme-c.md')}
BARS, TAIL = 170, Fraction('2.2')
FRAMES = round((BARS * 4 * BEAT + TAIL) * RATE)

# Rhythm stays recognizable through each theme. A voiced chord supplies the
# physical strings for these finger gestures, never the melody pitches.
GUITAR = {
    'flow': ('1/low/2.45/52', '1.75/inner/1.9/42', '2.5/B/2.1/41', '3.5/top/1.35/41'),
    'answer': ('1/low/2.7/52', '2/G/2.45/43', '3.5/top/1.35/40'),
    'air': ('1/low/3/52', '2.5/B/2.3/41', '3.5/top/1.35/40'),
    'hold-e': ('1/low/2.7/52', '2/G/2.65/42', '3.5/top/2.25/41'),
    'dominant': ('1/low/2.6/53', '2/inner/2.6/42', '3.5/G/1.8/42', '4.25/B/0.6/40'),
    'settle': ('1/low/3.75/52', '1.02/G/4.4/43', '1.04/B/4.38/42', '1.06/top/4.36/42'),
    'last': ('1/low/4.75/50', '1.02/G/4.73/42', '1.04/B/4.71/40', '1.06/top/4.69/40'),
}
B_GUITAR = ('flow', 'answer', 'flow', 'answer', 'flow', 'flow', 'answer', 'dominant',
            'flow', 'answer', 'flow', 'answer', 'flow', 'flow', 'answer', 'settle')
C_GUITAR = ('hold-e', 'hold-e', 'air', 'answer', 'air', 'answer', 'air', 'dominant',
            'air', 'hold-e', 'hold-e', 'air', 'answer', 'air', 'dominant', 'settle')
B_BASS = ('A1/E2', 'E1/B1', 'F1/C2', 'E1/G1', 'A1/E2', 'D2/A1', 'G1/D2', 'G1/D2/B1',
          'C2/G1', 'A1/E2', 'F1/C2', 'E1/G1', 'F1/C2', 'D2/A1', 'G1/D2/B1', 'C2')
C_BASS = ('F1/C2', 'E1/G1', 'A1/E2', 'F1/C2', 'F1/C2', 'D2/A1', 'G1/D2', 'G1/D2/B1',
          'C2/G1', 'F1/C2', 'E1/G1', 'A1/E2', 'F1/C2', 'D2/A1', 'G1/D2/B1', 'C2')
LOCAL_BACKING = {
    96: ('dominant', 'G1/D2/B1'), 167: ('settle', 'C2'), 168: ('air', 'F1/C2'),
    169: ('air', 'E1/G1'), 170: ('last', 'C2'),
}


def plan_rows():
    sections, overrides = [], {}
    form, edits = PLAN.read_text().split('## 过门、接音与尾声逐音表')
    for row in form.splitlines():
        columns = [column.strip() for column in row.strip('|').split('|')]
        if not row.startswith('|') or not columns[0].split('–')[0].isdigit():
            continue
        span, stamp, source, _ = columns
        bounds = tuple(map(int, span.split('–')))
        first, last = bounds[0], bounds[-1]
        source_parts = source.split('，', 1)[0].split()
        if source_parts[0] in THEMES:
            theme, source_span = source_parts[:2]
            start, end = map(int, source_span.split('–'))
            if end-start != last-first:
                raise ValueError(f'Theme range mismatch for bar {first}')
        elif source == '见下表':
            theme, start = None, None
        else:
            raise ValueError(f'Unrecognized score source for bar {first}')
        sections.append(dict(bar=first, last_bar=last, theme=theme, theme_start=start,
                             label=source, timestamp=stamp, start_seconds=float((first-1)*4*BEAT)))
    for row in edits.splitlines():
        columns = [column.strip() for column in row.strip('|').split('|')]
        if not row.startswith('|') or not columns[0].isdigit():
            continue
        bar, chord, melody = columns
        bar = int(bar)
        overrides[bar] = (chord, [
            Note(bar, Fraction(beat), pitch, Fraction(gate))
            for beat, pitch, gate in (token.strip().split('/') for token in melody.split(','))
        ])
    if [bar for s in sections for bar in range(s['bar'], s['last_bar']+1)] != list(range(1, BARS+1)):
        raise ValueError('Form has missing or duplicate bars')
    return sections, overrides


def assemble():
    themes = {name: read_lead_sheet(path) for name, path in THEMES.items()}
    sections, overrides = plan_rows()
    _, _, a_notes, _ = compose_a()
    a_by_bar = defaultdict(list)
    for note in a_notes:
        a_by_bar[note['bar']].append(note)
    events, lead, harmony = [], [], {}

    def add(part, bar, beat, pitch, gate, velocity, **articulation):
        position = ((bar-1)*4 + Fraction(beat)-1) * BEAT
        events.append(dict(part=part, bar=bar, beat=float(beat), start=float(position), pitch=pitch,
                           duration=float(Fraction(gate)*BEAT), velocity=velocity, **articulation))

    def accompaniment(section, bar, theme, local, chord):
        first = section['bar']
        if theme == 'A':
            for old in a_by_bar[local]:
                if old['part'] == 'marimba':
                    continue
                if old['part'] == 'brush' and (first == 41 or (first == 145 and (local >= 13 or
                                                                                (local >= 9 and old['pitch'] == 44)))):
                    continue
                offset = float((bar-local)*4*BEAT)
                events.append({**old, 'bar':bar, 'start':old['start']+offset})
            return

        if theme == 'B':
            gesture, bass = B_GUITAR[local-1], B_BASS[local-1]
        elif theme == 'C':
            gesture, bass = C_GUITAR[local-1], C_BASS[local-1]
        else:
            gesture, bass = LOCAL_BACKING[bar]
        _, voicing = engine_score.VOICINGS[chord]
        voiced = [i for i, pitch in enumerate(voicing) if pitch is not None]
        strings = {'low':voiced[0], 'inner':voiced[1], 'G':3, 'B':4, 'top':voiced[-1]}
        sparse_tail = first in (161, 167) and bar != 170
        for token in GUITAR[gesture]:
            beat, role, gate, velocity = token.split('/')
            if (sparse_tail or first == 1 or (first == 113 and local >= 9)) and role in ('inner','B'):
                continue
            string = strings[role]
            pitch, name = voicing[string], engine_score.STRINGS[string]
            velocity = int(velocity) - (3 if first in (1, 89, 161, 167) else 0)
            layer = 1 if velocity <= 48 else 2
            if engine_score.sample_name(name, pitch, layer) not in engine_score.SEED['samples']:
                layer = 3-layer
                velocity = 48 if layer == 1 else 49
            add('guitar', bar, beat, pitch, gate, velocity, string=name, layer=layer)

        if first != 1 or bar >= 5:
            bass_pitches = [midi_pitch(pitch) for pitch in bass.split('/')]
            positions = (('1','3.75',54),) if len(bass_pitches) == 1 else (
                ('1','2.45',55), ('3.5','1.45',46)) if len(bass_pitches) == 2 else (
                ('1','2.15',54), ('3.25','1.2',46), ('4.5','0.5',43))
            for pitch, (beat, gate, velocity) in zip(bass_pitches, positions, strict=True):
                if pitch % 12 not in engine_score.CHORD_TONES[chord] or (chord == 'C/E' and beat == '1' and pitch % 12 != 4):
                    raise ValueError(f'Bass contradicts {chord} in bar {bar}')
                add('bass', bar, beat, pitch, gate, velocity)

        # Each section controls when the light pulse enters or leaves.
        rhythm = ''
        if first == 25:
            rhythm = '2S 4S' if local not in (8,16) else '2S'
        elif first == 73:
            rhythm = '2S' if local <= 4 else '1K 2S 4S'
        elif (first == 113 and local <= 8) or (first == 129 and local >= 9):
            rhythm = '1K 2S'
        elif first == 89 and local <= 10:
            rhythm = '2S'
        for token in rhythm.split():
            pitch, gate, velocity = DRUMS[token[-1]]
            add('brush', bar, token[:-1], pitch, gate, velocity-2)

    for section in sections:
        first, theme, start = section['bar'], section['theme'], section['theme_start']
        for bar in range(first, section['last_bar']+1):
            local = start + bar-first if theme else None
            if bar in overrides:
                chord, row = overrides[bar]
            else:
                theme_chords, theme_notes = themes[theme]
                chord = theme_chords[local]
                row = [replace(note, bar=bar) for note in theme_notes if note.bar == local]
            harmony[bar] = chord
            lead.extend(row)
            velocities = [note['velocity'] for note in a_by_bar[local] if note['part'] == 'marimba'] if theme == 'A' else []
            if theme == 'A' and bar in overrides:
                velocities.insert(0, 58)
            if not velocities:
                base = 55 if theme == 'B' else 53
                base -= 3 if first in (1, 161, 167) else 0
                velocities = [base + (2 if note.beat == 1 else 0) - (3 if note.length <= Fraction('0.5') else 0)
                              for note in row]
            for note, velocity in zip(row, velocities, strict=True):
                add('marimba', bar, note.beat, midi_pitch(note.pitch), note.length, velocity)
            accompaniment(section, bar, theme, local, chord)

    issues, _ = check(lead)
    if issues:
        raise ValueError('; '.join(issues))
    events.sort(key=lambda note: (note['start'], note['part'], note['pitch']))
    strings = {}
    damped = []
    for event in events:
        if event['part'] != 'guitar':
            continue
        string = event['string']
        previous = strings.get(string)
        if previous and previous['start']+previous['duration'] > event['start']+1e-8:
            previous['duration'] = event['start']-previous['start']
            damped.append(dict(string=string, from_bar=previous['bar'], next_bar=event['bar'],
                               at_frame=round(event['start']*RATE)))
        strings[string] = event
    check_polyphony(events)
    if any(note['duration'] <= 0 or round((note['start']+note['duration'])*RATE) >= FRAMES for note in events):
        raise ValueError('Event is outside the full arrangement')
    samples = {engine_score.sample_name(n['string'],n['pitch'],n['layer']) for n in events if n['part']=='guitar'}
    if not samples <= engine_score.SEED['samples'].keys():
        raise ValueError('Arrangement needs unreviewed guitar recordings')
    return harmony, lead, events, sections, damped, sorted(samples)
