#!/usr/bin/env python3
"""Extract every Weird Frontiers class progression chart into data/classes/*.json.

    tools/build_class_charts.py            # (re)generate all charts
    tools/build_class_charts.py --check    # verify the committed files still match the books

The Gunslinger chart was originally transcribed by hand, cross-checked against both printings
and reviewed against the printed charts. This script REGENERATES it along with the other twelve
and asserts the result matches that known-good file level for level — so the hand-verified chart
doubles as the extractor's test fixture. If the extractor is wrong, Gunslinger fails first.

Why the charts need an extractor rather than more hand-transcription: thirteen classes at ten
levels with eight to eleven columns is roughly 1,200 values, and every one of them is a number
no Foundry test can check. The books also make it awkward:

  - headers span one, two or THREE rows and have to be merged column-wise ("ATTACK" above
    "BONUS" is one column, "ATTACK BONUS");
  - each class has its own signature column — Mojo die, Ballad die, Lucha die, Chi die, Creed
    die, Deadeye die — in a different position, plus percentage tracks (Derangement, Fame) and
    secondary tracks (Living Weapon, Battle Hardened);
  - the Gunslinger alone has NO attack-bonus column, and has a crit-threat-range column nothing
    else has;
  - case is inconsistent ("D10" vs "d10") and one header carries a stray \\x02 control character;
  - the first column is sometimes labelled LEVEL and sometimes blank.

Any header this script cannot classify is a hard error. Silently dropping a column is how a
class ends up shipping without its signature die.
"""
import argparse
import json
import pathlib
import re
import sys
import unicodedata

REPO = pathlib.Path(__file__).resolve().parent.parent
import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from corpus_paths import CORPUS, V6 as _V6, RG as _RG, require  # noqa: E402

# This tool joins CORPUS / <name> itself, so it wants the bare filenames.
V6 = _V6.name
RG = _RG.name
DS = 'Dog_Soldier.md'
OUT = REPO / 'data' / 'classes'

# classId -> (source file, line of the chart's FIRST header row, display label)
CLASSES = {
    'bedlamite': (V6, 1082, 'Bedlamite'),
    'calavera': (V6, 1161, 'Calavera'),
    'gambler': (V6, 1311, 'Gambler'),
    'gunslinger': (V6, 1405, 'Gunslinger'),
    'hellbilly': (V6, 1586, 'Hellbilly'),
    'luchador': (V6, 1760, 'Luchador'),
    'mountebank': (V6, 1973, 'Mountebank'),
    'mystic-monk': (V6, 2089, 'Mystic Monk'),
    'occultist': (V6, 2259, 'Occultist'),
    'revelator': (V6, 2457, 'Revelator'),
    'sin-eater': (V6, 2544, 'Sin-Eater'),
    'tommyknocker': (V6, 2658, 'Tommyknocker'),
    'dog-soldier': (DS, 58, 'Dog Soldier'),
}

# Normalised header label -> canonical field. Anything absent is a hard error.
CANONICAL = {
    'LEVEL': 'level', '': 'level',
    'TITLE': 'title', 'LEVEL TITLE': 'level',
    'ATTACK': 'attackBonus', 'ATTACK BONUS': 'attackBonus',
    'CRIT DIE': 'critDie', 'CRIT': 'critDie',
    'FUMBLE DIE': 'fumbleDie', 'FUMBLE': 'fumbleDie',
    'ACTION DIE': 'actionDice', 'ACTION DICE': 'actionDice',
    'REF': 'ref', 'FORT': 'fort', 'WILL': 'will',
    'CRITICAL THREAT RANGE': 'critRange', 'THREAT RANGE': 'critRange',
    'CRITICAL': 'critRange',
}

# Class-signature columns. The printed label is preserved so the sheet can show it.
CLASS_DIE = re.compile(r'^(DEADEYE|MOJO|BALLAD|LUCHA|CHI|CREED)\s+DIE$')
PERCENT_TRACK = re.compile(r'^(DERANGEMENT|FAME)$')
# Matched against the label with internal spaces removed: the Luchador's header carries a raw
# \x02 inside "HARDENED", which strips to "BATTLE HARD ENED".
SECONDARY = re.compile(r'^(LIVINGWEAPON|BATTLEHARDENED)$')

HIT_DIE = re.compile(r'^\*\*Hit (?:Points|Die):\*\*.*?\bd(\d+)\b', re.I)
CRIT_FUMBLE = re.compile(r'^\*\*Crit Die:\*\*\s*(d\d+)\s*\*\*Fumble Die:\*\*\s*(d\d+)', re.I)
WEALTH = re.compile(r'\bstart(?:ing)?.{0,40}?\b(\d+d\d+)\b', re.I)


def read(name):
    return (CORPUS / name).read_text(encoding='utf-8').split('\n')


def clean(cell):
    """Strip control characters and collapse whitespace. One header carries a raw \\x02."""
    text = ''.join(c for c in cell if unicodedata.category(c)[0] != 'C')
    return re.sub(r'\s+', ' ', text).strip()


def die(value):
    """'d10' / 'D10' / '+d3' -> '1d10' / '1d3'. 'd20+1' keeps its bonus."""
    text = clean(value).lstrip('+').lower()
    if not text:
        return ''
    return text if text.startswith('1d') else ('1' + text if text.startswith('d') else text)


def bonus(value):
    text = clean(value).replace('+', '').strip()
    if text in ('', '-', '—'):
        return 0
    return int(text)


def table_at(lines, header_line):
    """Header rows and data rows of the table whose first header row is at `header_line`."""
    header, data = [], []
    for raw in lines[header_line - 1:]:
        text = raw.strip()
        if not text.startswith('|'):
            if data:
                break
            continue
        cells = [clean(c) for c in text.strip('|').split('|')]
        if set(''.join(cells)) <= set('-: '):
            continue
        if re.fullmatch(r'\d+', cells[0]):
            data.append(cells)
        elif not data:
            header.append(cells)
        elif any(cells[1:]):
            # A row with no level but real content is the SECOND HALF of a row the conversion
            # split in two — the Mystic Monk's 3rd level wraps its title ("Follower of the" /
            # "Dragon Path") and carries every other value on the continuation line. Treating it
            # as end-of-table silently truncated that class to three levels. Merge it into the
            # row above: take the continuation's value where the first half is blank, and join
            # the two halves where both have text (which reassembles the title).
            previous = data[-1]
            data[-1] = [f'{a} {b}'.strip() if (a and b) else (a or b)
                        for a, b in zip(previous, cells)]
        else:
            break
    return header, data


def merge_header(header_rows, width):
    """Merge stacked header rows column-wise: 'ATTACK' over 'BONUS' becomes 'ATTACK BONUS'."""
    merged = []
    for i in range(width):
        parts = [row[i] for row in header_rows if i < len(row) and row[i]]
        merged.append(clean(' '.join(parts)).upper())
    return merged


def classify(labels, class_id, problems):
    """Map each column index to a canonical field, or to a named class-specific track."""
    mapping, extras = {}, {}
    for index, label in enumerate(labels):
        if index == 0:
            mapping[index] = 'level'
            continue
        if label in CANONICAL:
            mapping[index] = CANONICAL[label]
        elif CLASS_DIE.match(label):
            mapping[index] = 'classDie'
            extras['classDieLabel'] = label.title()
        elif PERCENT_TRACK.match(label):
            mapping[index] = 'percentTrack'
            extras['percentTrackLabel'] = label.title()
        elif SECONDARY.match(label.replace(' ', '')):
            mapping[index] = 'secondaryTrack'
            extras['secondaryTrackLabel'] = label.title()
        else:
            problems.append(f'{class_id}: unclassified chart column {index} {label!r} — '
                            f'add it to CANONICAL or to a track pattern rather than losing it')
    return mapping, extras


def prose_before(lines, limit, pattern):
    """Nearest line above `limit` matching `pattern`. Class prose precedes its chart."""
    for n in range(limit - 1, max(0, limit - 260), -1):
        match = pattern.match(lines[n - 1].strip())
        if match:
            return n, match
    return None, None


def find_cross_check(rg_lines, label):
    """The Reference Guide reprints some class charts; find one if it exists."""
    wanted = f'{label.upper()} PROGRESSION CHART'
    for n, raw in enumerate(rg_lines, start=1):
        if wanted in raw.upper():
            for m in range(n, min(n + 8, len(rg_lines))):
                if rg_lines[m - 1].strip().startswith('|'):
                    return m
    return None


def build_class(class_id, source, header_line, label, problems):
    lines = read(source)
    rg_lines = read(RG)

    header_rows, data_rows = table_at(lines, header_line)
    if not data_rows:
        problems.append(f'{class_id}: no data rows at {source}:{header_line}')
        return None
    width = max(len(r) for r in data_rows)
    labels = merge_header(header_rows, width)
    mapping, extras = classify(labels, class_id, problems)

    levels = []
    for cells in data_rows:
        entry = {}
        for index, field in mapping.items():
            if index >= len(cells):
                continue
            raw = cells[index]
            if field == 'level':
                entry['level'] = int(raw)
            elif field == 'title':
                entry['title'] = raw
            elif field in ('critDie', 'fumbleDie', 'classDie'):
                entry[field] = die(raw)
            elif field == 'actionDice':
                entry['actionDice'] = ','.join(p.strip() for p in raw.split('+'))
            elif field == 'critRange':
                entry['critRange'] = int(raw.split('-')[0])
            elif field == 'attackBonus':
                entry['attackBonus'] = clean(raw) or '+0'
            elif field in ('percentTrack', 'secondaryTrack'):
                entry[field] = clean(raw)
            else:
                entry[field] = bonus(raw)
        entry.setdefault('title', '')
        levels.append(entry)

    hd_line, hd = prose_before(lines, header_line, HIT_DIE)
    cf_line, cf = prose_before(lines, header_line, CRIT_FUMBLE)
    if not hd:
        problems.append(f'{class_id}: no "**Hit Points:**"/"**Hit Die:**" line above the chart')
    if not cf:
        problems.append(f'{class_id}: no "**Crit Die:** … **Fumble Die:** …" line above the chart')

    # Each class states its 1st-level crit and fumble dice twice: once in prose, once in the
    # chart's first row. Where they disagree the CHART wins and the disagreement is recorded —
    # never silently resolved. In all three cases found (calavera, sin-eater, dog-soldier) the
    # chart's value begins a coherent paired progression (d7,d7,d8,d8,d10,... for the calavera)
    # that the prose value would break, so the prose reads as a typo. That is a judgement, so it
    # is written into the data for a human reviewer to check, not buried.
    # Where the Reference Guide reprints the chart, read its 1st-level crit die too. A
    # prose/chart disagreement resolved by a SECOND INDEPENDENT PRINTING agreeing with the chart
    # is a much stronger result than one resolved by "the progression looks tidier".
    cross_line = find_cross_check(rg_lines, label)
    cross_first = {}
    if cross_line:
        cross_header, cross_data = table_at(rg_lines, cross_line)
        if cross_data:
            cross_labels = merge_header(cross_header, max(len(r) for r in cross_data))
            cross_map, _ = classify(cross_labels, class_id, [])
            for index, field in cross_map.items():
                if field in ('critDie', 'fumbleDie') and index < len(cross_data[0]):
                    cross_first[field] = die(cross_data[0][index])

    conflicts = []
    if cf and levels:
        for field, printed in (('critDie', cf.group(1)), ('fumbleDie', cf.group(2))):
            if field in levels[0] and levels[0][field] != die(printed):
                entry = {
                    'field': field,
                    'prose': die(printed),
                    'proseCite': f'{source}:{cf_line}',
                    'chart': levels[0][field],
                    'chartCite': f'{source}:{header_line}',
                    'resolution': 'chart',
                    'reason': ('The chart value starts a coherent progression across all ten '
                               'levels; the prose value does not fit it.'),
                }
                if field in cross_first:
                    entry['secondPrinting'] = cross_first[field]
                    entry['secondPrintingCite'] = f'{RG}:{cross_line}'
                    entry['reason'] += (
                        ' The Reference Guide reprint of the same chart agrees with the chart '
                        f"value ({cross_first[field]}), not the prose."
                        if cross_first[field] == levels[0][field] else
                        ' NOTE: the Reference Guide reprint agrees with NEITHER — re-check.')
                conflicts.append(entry)

    source_block = {
        'chart': f'{source}:{header_line}-{header_line + len(header_rows) + len(data_rows) - 1}',
        'hitDie': f'{source}:{hd_line}' if hd_line else '',
        'critFumbleProse': f'{source}:{cf_line}' if cf_line else '',
        'note': 'Generated by tools/build_class_charts.py; never hand-edit.',
    }
    if cross_line:
        source_block['chartCrossCheck'] = f'{RG}:{cross_line}'
    if conflicts:
        source_block['conflicts'] = conflicts

    return {
        'classId': class_id,
        'sheetClass': label.replace(' ', '-'),
        'label': label,
        'source': source_block,
        'hitDie': f'1d{hd.group(1)}' if hd else '',
        'attackBonus': {
            'value': '+0',
            'note': ('Per-level attack bonus is carried on each level entry below, where the '
                     'chart has an ATTACK BONUS column. TWO classes have none: the Gunslinger, '
                     'which relies on its Deadeye die, and the Mystic Monk, whose chart carries '
                     'Living Weapon and Chi Die in its place. Their level entries therefore '
                     'have no attackBonus and fall back to +0.'),
        },
        'chartColumns': [mapping.get(i, '') for i in range(width)],
        **extras,
        'levels': levels,
    }


def build():
    problems = []
    charts = {}
    for class_id, (source, header_line, label) in CLASSES.items():
        chart = build_class(class_id, source, header_line, label, problems)
        if chart:
            charts[class_id] = chart
    if problems:
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        sys.exit(f'{len(problems)} problem(s) extracting class charts — refusing to write')
    return charts


def regression_check(charts):
    """The hand-verified Gunslinger chart is the extractor's fixture."""
    existing = OUT / 'gunslinger.json'
    if not existing.exists():
        return
    want = json.loads(existing.read_text())['levels']
    got = charts['gunslinger']['levels']
    for a, b in zip(want, got):
        for key in ('level', 'title', 'critDie', 'fumbleDie', 'actionDice', 'critRange',
                    'ref', 'fort', 'will'):
            if key in a and a[key] != b.get(key):
                sys.exit(f'REGRESSION: gunslinger L{a["level"]} {key}: hand-verified '
                         f'{a[key]!r} but the extractor produced {b.get(key)!r}')


def main():
    # A --check without the books skips loudly; a regenerate still needs them.
    if not require(CORPUS / V6, CORPUS / RG, soft=('--check' in sys.argv)):
        return
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    charts = build()
    regression_check(charts)

    failed = False
    for class_id, chart in sorted(charts.items()):
        path = OUT / f'{class_id}.json'
        rendered = json.dumps(chart, indent=2, ensure_ascii=False) + '\n'
        if args.check:
            current = path.read_text(encoding='utf-8') if path.exists() else ''
            if current != rendered:
                print(f'FAIL {class_id}: {path.name} does not match the books', file=sys.stderr)
                failed = True
        else:
            path.write_text(rendered, encoding='utf-8')
    if args.check:
        if failed:
            sys.exit('run tools/build_class_charts.py')
        total = sum(len(c['levels']) for c in charts.values())
        print(f'ok   data/classes: {len(charts)} classes, {total} levels match the books')
    else:
        total = sum(len(c['levels']) for c in charts.values())
        print(f'wrote {len(charts)} class charts, {total} levels')


if __name__ == '__main__':
    main()
