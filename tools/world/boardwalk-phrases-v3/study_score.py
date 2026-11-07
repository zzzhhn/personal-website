"""Build only the reviewed 16-bar study. Every note is authored on the beat grid."""
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
import sys

from check_phrase import DRAFT, check, read_lead_sheet

sys.path.append(str(Path(__file__).resolve().parents[1] / 'boardwalk-longform'))
import score as engine_score

BPM, BARS, TAIL = 82, 16, Fraction('1.2')
BEAT = Fraction(60, BPM)
RATE, PPQ = engine_score.RATE, engine_score.PPQ
FRAMES = round((BARS * 4 * BEAT + TAIL) * RATE)
PITCH_CLASSES = dict(zip('CDEFGAB', (0, 2, 4, 5, 7, 9, 11)))

# beat/string/gate/velocity. The guitar bass note follows the explicit voicing.
# Hi=high E string, Lo=low E string. The longer Hi at bar 2 and B at
# bar 10 keep the same physical string and pitch across the next chord.
GUITAR = [
    '1/A/1.75/53 2/D/1.75/43 3/G/1.5/41 4/B/0.85/38',
    '1/D/2.25/52 2/G/2.5/43 3/B/1.75/39 3.5/Hi/2/44',
    '1/A/1.85/51 2/G/1.85/41 3/B/1.25/40 4/D/0.85/43',
    '1/Lo/2.5/54 2.25/G/1.75/42 3.25/B/1.5/39 4/Hi/0.9/40',
    '1/D/2.6/54 1.75/G/2.5/45 2.5/B/2.25/43 3.25/Hi/1.6/43',
    '1/D/1.85/55 2/G/2.5/42 3/B/1.65/42 4.25/Hi/0.65/42',
    '1/Lo/2.45/54 2/D/1.55/42 3/G/1.85/41 4/B/0.85/43',
    '1/Lo/2.45/51 1.75/Hi/1.7/43 3/D/1.75/40 4.25/B/0.65/41',
    '1/A/1.75/54 2/D/1.75/44 3/G/1.5/42 4/B/0.85/40',
    '1/D/2.5/52 2/Hi/2.5/43 3/G/2.5/44 3.5/B/2/43',
    '1/D/2.5/53 2.75/Hi/1.75/41 3.5/B/1.35/40 4/G/0.85/42',
    '1/Lo/2.5/52 1.75/G/1.5/44 3/D/1.75/43 4/B/0.85/40',
    '1/D/2.5/54 1.75/G/2.5/45 2.5/B/2.25/42 3.25/Hi/1.6/42',
    '1/D/2.5/54 2/G/2.25/42 3/B/1.75/41 4/Hi/0.9/41',
    '1/Lo/2.5/53 1.75/D/1.75/44 2.5/G/1.75/43 3/Hi/1.9/43 4/B/0.9/43',
    '1/A/4.35/55 1.02/D/4.33/46 1.04/G/4.31/43 1.06/B/4.29/42 1.08/Hi/4.27/43',
]

# beat/pitch/gate/velocity. Inversions and the two B→C pickups are explicit.
BASS = [
    '1/C2/2/59 3/G1/1.65/49',
    '1/F1/2.5/57 3.5/C2/1.25/48',
    '1/A1/1.95/56 3/E2/1.6/47',
    '1/E1/2.25/55 3.5/G1/1.5/47',
    '1/F1/2.75/58 4/C2/0.8/47',
    '1/D2/2.5/57 3.5/A1/1.25/47',
    '1/G1/1.95/56 3/D2/1.5/49',
    '1/G1/2/54 3/D2/1.25/47 4.5/B1/0.5/45',
    '1/C2/1.95/58 3/G1/1.65/49',
    '1/F1/2.4/57 3.5/C2/1.25/48',
    '1/D2/2.5/56 3.5/A1/1.25/47',
    '1/E1/2.25/55 3.5/G1/1.5/47',
    '1/F1/2.75/58 4/C2/0.8/48',
    '1/D2/2.5/57 3.5/A1/1.25/48',
    '1/G1/1.95/56 3/D2/1.3/49 4.5/B1/0.5/45',
    '1/C2/3.75/58',
]

# Sparse pulse. K=soft kick, S=brush kit backbeat, H=pedal hat.
BRUSH = [
    '1K 2S 3H 4S', '1K 2S 4H', '2S 3H 4S', '1K 2H 4S',
    '1K 2S 3H 4S', '1K 2S 4S', '1K 2S 3H 4S', '1K 2S 3H',
    '1K 2S 3H 4S', '1K 2S 4H', '2S 3H 4S', '1K 2H 4S',
    '1K 2S 3H 4S', '1K 2S 4S', '1K 2S 3H', '1K',
]
DRUMS = {'K': (36, '.18', 33), 'S': (38, '.32', 31), 'H': (44, '.16', 21)}
LEAD_VELOCITIES = [
    (61, 55, 59, 53), (60, 53, 51), (55, 49, 56, 51), (55, 49, 52),
    (57, 54, 57), (61, 53, 57, 51), (57, 53, 57), (55, 51, 52),
    (59, 61, 55, 59, 53), (60, 53, 53), (52, 48, 55, 53), (58, 51, 55),
    (57, 54, 57), (61, 53, 57, 51), (57, 53, 52), (59,),
]
STRINGS = {'Lo': 0, 'A': 1, 'D': 2, 'G': 3, 'B': 4, 'Hi': 5}


def midi_pitch(pitch):
    return (int(pitch[1:]) + 1) * 12 + PITCH_CLASSES[pitch[0]]


def compose():
    harmony, lead = read_lead_sheet(DRAFT)
    issues, _ = check(lead)
    if issues:
        raise ValueError('; '.join(issues))
    notes = []

    def add(part, bar, beat, pitch, gate, velocity, **articulation):
        beat, gate = Fraction(beat), Fraction(gate)
        start = ((bar - 1) * 4 + beat - 1) * BEAT
        notes.append(dict(part=part, bar=bar, beat=float(beat), pitch=pitch, start=float(start),
                          duration=float(gate * BEAT), velocity=velocity, **articulation))

    sample_names = set()
    for bar, (guitar, bass, brush, dynamics) in enumerate(zip(GUITAR, BASS, BRUSH, LEAD_VELOCITIES, strict=True), 1):
        chord = harmony[bar]
        _, voicing = engine_score.VOICINGS[chord]
        for beat, string, gate, velocity in (token.split('/') for token in guitar.split()):
            string_index = STRINGS[string]
            pitch = voicing[string_index]
            name = engine_score.STRINGS[string_index]
            if pitch is None:
                raise ValueError(f'Unvoiced {name} in bar {bar} {chord}')
            velocity = int(velocity)
            layer = 1 if velocity <= 48 else 2
            filename = engine_score.sample_name(name, pitch, layer)
            if filename not in engine_score.SEED['samples']:
                # Keep the written pitch/string. Use the other approved recorded layer
                # if this exact note exists only in one of the cached v2 layers.
                layer = 3 - layer
                velocity = 48 if layer == 1 else 49
                filename = engine_score.sample_name(name, pitch, layer)
            if filename not in engine_score.SEED['samples']:
                raise ValueError(f'Missing exact approved sample {filename}')
            sample_names.add(filename)
            add('guitar', bar, beat, pitch, gate, velocity, string=name, layer=layer)
        bass_pitches = []
        for beat, pitch, gate, velocity in (token.split('/') for token in bass.split()):
            pitch = midi_pitch(pitch)
            if pitch % 12 not in engine_score.CHORD_TONES[chord]:
                raise ValueError(f'Unspecified bass tension {pitch} in bar {bar} {chord}')
            bass_pitches.append(pitch)
            add('bass', bar, beat, pitch, gate, int(velocity))
        if chord == 'C/E' and bass_pitches[0] % 12 != 4:
            raise ValueError(f'Bar {bar} lost its E inversion')
        for token in brush.split():
            pitch, gate, velocity = DRUMS[token[-1]]
            add('brush', bar, token[:-1], pitch, gate, velocity)
        for note, velocity in zip((note for note in lead if note.bar == bar), dynamics, strict=True):
            add('marimba', bar, note.beat, midi_pitch(note.pitch), note.length, velocity)

    notes.sort(key=lambda note: (note['start'], note['part'], note['pitch']))
    check_polyphony(notes)
    return harmony, lead, notes, sorted(sample_names)


def check_polyphony(notes):
    endings = defaultdict(float)
    for note in notes:
        part = note['part']
        identity = (part, note['string'] if part == 'guitar' else note['pitch'] if part == 'brush' else None)
        if note['start'] < endings[identity] - 1e-8:
            raise ValueError(f'Overlapping {identity} gate in bar {note["bar"]}')
        endings[identity] = note['start'] + note['duration']
