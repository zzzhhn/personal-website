"""Check melody event boundaries in the reviewed draft or the old reproduction."""
import argparse
from dataclasses import dataclass
from fractions import Fraction
import importlib.util
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[3]
DRAFT = ROOT / 'docs/world/phase-2-playground/boardwalk-phrases-v3/lead-sheet.md'
LEGACY = ROOT / 'tools/world/boardwalk-longform/score.py'
PITCH = re.compile(r'[A-G][34-6]')
MAX_INTERNAL_REST = Fraction(2)


@dataclass(frozen=True)
class Note:
    bar: int
    beat: Fraction
    pitch: str
    length: Fraction

    @property
    def start(self):
        return (self.bar - 1) * 4 + self.beat - 1

    @property
    def end(self):
        return self.start + self.length

    def __str__(self):
        return f'bar {self.bar} beat {float(self.beat):g} {self.pitch}'


def read_lead_sheet(path):
    harmony, notes = {}, []
    for line in path.read_text().splitlines():
        columns = [column.strip() for column in line.strip().strip('|').split('|')]
        if not columns[0].isdigit():
            continue
        bar, chord, melody = columns
        bar = int(bar)
        if not chord or bar in harmony:
            raise ValueError(f'Bar {bar} is duplicated or missing harmony')
        harmony[bar] = chord
        for token in melody.split(','):
            beat, pitch, length = token.strip().split('/')
            note = Note(bar, Fraction(beat), pitch, Fraction(length))
            if not PITCH.fullmatch(note.pitch) or not (1 <= note.beat < 5) or note.length <= 0:
                raise ValueError(f'Invalid melody note: {note}')
            notes.append(note)
    if list(harmony) != list(range(1, 17)):
        raise ValueError('Expected one row each for bars 1–16 in score order')
    if any(note.end > 64 for note in notes):
        raise ValueError('Melody extends past bar 16')
    return harmony, notes


def read_draft(path):
    return read_lead_sheet(path)[1]


def read_legacy():
    spec = importlib.util.spec_from_file_location('legacy_boardwalk_score', LEGACY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    notes, _, _ = module.compose()
    names = 'C C# D D# E F F# G G# A A# B'.split()
    return [
        Note(note['bar'], Fraction(str(note['beat'])), f"{names[note['pitch'] % 12]}{note['pitch'] // 12 - 1}",
             Fraction(str(round(note['duration'] / module.BEAT, 5))))
        for note in notes if note['part'] == 'marimba' and 9 <= note['bar'] <= 16
    ]


def check(notes):
    # No gate overlaps in this monophonic lead. The rest ceiling belongs to
    # this phrase study, not to arbitrary music or to the sampler's decay.
    if len(notes) < 2:
        raise ValueError('Expected at least two melody attacks')
    if notes != sorted(notes, key=lambda note: note.start):
        raise ValueError('Melody attacks are out of order')
    edges = [(right.start - left.end, left, right) for left, right in zip(notes, notes[1:])]
    overlap, left, right = min(edges, key=lambda edge: edge[0])
    issues = []
    if overlap < 0:
        issues.append(f'Gate overlap {-float(overlap):g} beats: {left} -> {right}')
    rest, left, right = max(edges, key=lambda edge: edge[0])
    if rest > MAX_INTERNAL_REST:
        issues.append(f'Internal rest {float(rest):g} beats: {left} -> {right}')
    return issues, rest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy', action='store_true', help='Reproduce old bars 9–16; expected to fail')
    args = parser.parse_args()
    notes = read_legacy() if args.legacy else read_draft(DRAFT)
    issues, longest_rest = check(notes)
    if issues:
        for issue in issues:
            print(issue, file=sys.stderr)
        return 1
    print(f'{len(notes)} melody notes; no gate overlap; longest internal rest {float(longest_rest):g} beats')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
