#!/usr/bin/env python3
"""Extract the Weird Frontiers firearms tables into data/firearms.json.

    tools/build_firearms.py            # (re)generate data/firearms.json
    tools/build_firearms.py --check    # verify the committed file still matches the books

SOURCING. Tables come from the Reference Guide, per the project rule: V6's pdf2md pass mangles
some firearm rows, RG's survived. Two things make this safer than a single parse:

  1. RG prints the ENTIRE advanced block TWICE (revolvers at 1460 and 1506, derringers 1547 and
     1591, rifles 1558 and 1602, shotguns 1579 and 1623). Both copies are parsed and asserted
     identical, which catches a conversion artifact in one of them for free. This is the same
     duplication that makes word-count and vocabulary metrics useless on this corpus — here it
     is turned into a check.
  2. Rows whose MODEL cell is a wrapped continuation ("Conversion", "Army", "(Frontier)",
     "Pinfire") are unusable as names. Each is resolved against V6's copy of the same table,
     matched on caliber + damage + load + price, and the correction is recorded with its V6
     citation in NAME_FIXES below. V6 also carries a YEAR column the Reference Guide omits.

The DERRINGERS table did not survive conversion at all — every row is crammed into the header
cell — so those three guns are transcribed by hand from that cell, with the citation.
"""
import argparse
import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from corpus_paths import CORPUS, V6, RG, require  # noqa: E402
TARGET = REPO / 'data' / 'firearms.json'

# section -> (first printing header line, second printing header line, row count)
# Line numbers are 1-indexed and point at the table's MODEL header row.
SECTIONS = {
    'revolver': (1460, 1506, 36),
    # The derringer table's HEADER cell swallowed its first three rows (see DERRINGERS below),
    # but eight more sit in the table body underneath it and parse normally. An earlier version
    # of this script saw the broken header, assumed the whole table was destroyed, and shipped a
    # compendium missing eight guns. Check for body rows before concluding a table is lost.
    'derringer': (1547, 1591, 8),
    'rifle': (1558, 1602, 20),
    'shotgun': (1579, 1623, 8),
}

COLUMNS = ['model', 'caliber', 'actionType', 'ammo', 'damage',
           'rof', 'load', 'reloadTime', 'range', 'conceal', 'price']

# Wrapped MODEL cells, resolved against V6 by matching caliber + damage + load + price.
# Keyed by the printed (broken) name plus caliber so a repeated broken name stays unambiguous.
NAME_FIXES = {
    ('Pinfire', '7.65mm (.30)'):
        ('Lefaucheux Doublebarrel Pinfire', 'Weird_Frontiers_V6.md:16033'),
    ('(Frontier)', '.44'):
        ('Merwin Hulbert Model 3 (Frontier)', 'Weird_Frontiers_V6.md:16037'),
    ('Conversion', '.36'):
        ('Remington Navy Model - Conversion', 'Weird_Frontiers_V6.md:16040'),
    ('Conversion', '.44'):
        ('Richards-Mason Army Colt Conversion', 'Weird_Frontiers_V6.md:16041'),
    ('Army', '.32'):
        ('Smith & Wesson Model No. 2 Army', 'Weird_Frontiers_V6.md:16043'),
}

# The derringers table is destroyed in conversion — all three rows sit inside the header cell at
# Weird_Frontiers_Reference_Guide.md:1591. Transcribed by hand from that cell:
#   MODEL  Colt Derringer | Philadelphia Deringer | Reid's Knuckleduster
#   CAL    .41 | .41 | .32          TYPE   Single | Single | Single
#   AMMO   Cart. | Muzzleloading C&B | Cart.
#   DAMAGE d8 | d8 | d6 (d4 melee)  ROF    1 | 1 | 2       LOAD  1 | 1 | 5
#   RELOAD 1 | 4 | 3                RANGE  2/8/16 | 2/5/12 | 2/4/8
#   CON    5 | 3 | 4                PRICE  $8 | $15 for pair | $10
DERRINGERS = [
    ('Colt Derringer', '.41', 'Single', 'Cart.', 'd8', '1', '1', '1', '2/8/16', '5', '$8'),
    ('Philadelphia Deringer', '.41', 'Single', 'Muzzleloading C&B', 'd8', '1', '1', '4',
     '2/5/12', '3', '$15 for pair'),
    ("Reid's Knuckleduster", '.32', 'Single', 'Cart.', 'd6 (d4 melee)', '2', '5', '3',
     '2/4/8', '4', '$10'),
]
DERRINGER_CITE = 'Weird_Frontiers_Reference_Guide.md:1591'


def table_rows(lines, header_line, limit):
    """Data rows of the markdown table whose header is at 1-indexed `header_line`."""
    rows = []
    for raw in lines[header_line:]:
        text = raw.strip()
        if not text.startswith('|'):
            break
        cells = [c.strip() for c in text.strip('|').split('|')]
        if set(''.join(cells)) <= set('-: '):
            continue
        if cells[0].upper().startswith('MODEL'):
            continue
        # A row with an empty MODEL cell is kept: it may be the first half of a row the
        # conversion split across two lines, which merge_fragments() rejoins. Dropping it here
        # is what truncated the Dolne Apache Pistol's damage to "blade)".
        if not cells[0] and not any(cells[1:]):
            continue
        rows.append(cells)
    return merge_fragments(rows)[:limit]


def merge_fragments(rows):
    """Join rows split across two lines by the PDF conversion.

    The Dolne Apache Pistol is printed over two lines: the first carries its caliber, type and
    the start of its damage with no model name; the second carries the name and the rest. A
    row whose MODEL cell is empty is a fragment, and is merged into the row that follows it —
    cell by cell, taking the fragment's value where the successor's is blank and concatenating
    where both have text (which reassembles 'd6 (d5 brass knuckles/ d4' + 'blade)').
    """
    merged = []
    pending = None
    for cells in rows:
        if not cells[0]:
            pending = cells
            continue
        if pending:
            joined = []
            for a, b in zip(pending, cells):
                joined.append(f'{a} {b}' if (a and b) else (b or a))
            cells = joined
            pending = None
        merged.append(cells)
    return merged


def clean(cell):
    """Strip the pdf2md escaping: `\\$16` -> `$16`, curly quotes -> straight."""
    return (cell.replace('\\$', '$')
                .replace('“', '"').replace('”', '"')
                .replace('’', "'").strip())


def parse_price(cell):
    """Returns (number, verbatim).

    Most prices print as '$16', but three derringers print a bare number ('5', '11', '13') and
    one prints '$15 for pair'. The number is for sorting and arithmetic; the verbatim string is
    kept because it carries meaning a float cannot ('for pair').
    """
    text = clean(cell)
    match = re.search(r'\$\s*([\d.]+)', text) or re.search(r'^([\d.]+)$', text)
    return (float(match.group(1)) if match else 0.0), text


def build():
    rg = RG.read_text(encoding='utf-8').split('\n')
    v6 = V6.read_text(encoding='utf-8').split('\n')
    guns = []
    problems = []

    for kind, (first, second, count) in SECTIONS.items():
        a = table_rows(rg, first, count)
        b = table_rows(rg, second, count)
        if len(a) != count:
            problems.append(f'{kind}: expected {count} rows at line {first}, parsed {len(a)}')
            continue
        if a != b:
            for i, (x, y) in enumerate(zip(a, b)):
                if x != y:
                    problems.append(f'{kind} row {i}: the two printings disagree\n'
                                    f'      copy1 {x}\n      copy2 {y}')
            continue
        for cells in a:
            guns.append(make_gun(kind, cells, problems))

    for row in DERRINGERS:
        guns.append(make_gun('derringer', list(row), problems, cite=DERRINGER_CITE))

    # V6 carries a YEAR column the Reference Guide omits. Match on exact (corrected) name.
    years = v6_years(v6)
    for gun in guns:
        if gun['name'] in years:
            gun['year'] = years[gun['name']]

    if problems:
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        sys.exit(f'{len(problems)} problem(s) extracting firearms — refusing to write data')

    return {
        'source': {
            'primary': 'Weird_Frontiers_Reference_Guide.md:1506-1632',
            'crossCheck': 'the same tables are printed twice in the Reference Guide; '
                          'both printings are parsed and asserted identical',
            'names': 'wrapped MODEL cells resolved against Weird_Frontiers_V6.md:16029-16047',
            'derringers': DERRINGER_CITE,
            'note': 'Regenerate with tools/build_firearms.py; never hand-edit.',
        },
        'guns': guns,
    }


def make_gun(kind, cells, problems, cite=None):
    row = dict(zip(COLUMNS, [clean(c) for c in cells]))
    # The Dolne Apache row ends with a stray double quote from the conversion.
    name = row['model'].rstrip('"').strip()
    fix = NAME_FIXES.get((name, row['caliber']))
    fixed_from = None
    if fix:
        fixed_from, name = name, fix[0]
        cite = fix[1]

    price_value, price_text = parse_price(row['price'])
    try:
        conceal = int(row['conceal'])
    except ValueError:
        conceal = 0
        problems.append(f"{name}: conceal {row['conceal']!r} is not an integer")

    # Damage parsing, in this order — getting it wrong produced "1d8 (d10" for the LeMat,
    # whose printed damage is "d8 (d10/d6/d4)": the parenthesised part is its SECOND BARREL
    # (a shotgun), not a band of the first. So parentheses come out before any "/" split.
    #
    #   "d10"                 -> damage 1d10
    #   "d14/d10/d7"          -> damage 1d14, banded d14/d10/d7      (shotgun bands)
    #   "d8 (d10/d6/d4)"      -> damage 1d8,  secondBarrel d10/d6/d4 (LeMat)
    #   "d6 (d4 melee)"       -> damage 1d6,  meleeNote "d4 melee"
    #   "d8/d4/d3 (d6 melee)" -> damage 1d8,  banded d8/d4/d3, meleeNote "d6 melee"
    damage_text = row['damage']
    melee_note = ''
    second_barrel = ''
    # Classify each parenthesised group. A group is a SECOND BARREL only if it is a pure banded
    # dice profile — every "/"-separated token is a die. Anything mentioning a hand weapon is an
    # alternate melee profile. Getting this wrong mattered: "d6 (d5 brass knuckles/ d4 blade)"
    # contains a "/" and would otherwise have been filed as a shotgun barrel, and
    # "d8 (d4 with blade)" never says "melee" so a melee-only test dropped it silently.
    for group in re.findall(r'\(([^)]*)\)', damage_text):
        text = group.strip()
        parts = [p.strip() for p in text.split('/')]
        is_dice_profile = len(parts) > 1 and all(re.fullmatch(r'\d*d\d+', p) for p in parts)
        if is_dice_profile:
            second_barrel = text
        elif re.search(r'melee|blade|knuckle|dagger|butt|club', text, re.I):
            melee_note = text
        else:
            problems.append(f"{name}: unclassified damage note {text!r}")
    base = re.sub(r'\([^)]*\)', '', damage_text).strip()

    # A "/" in the remaining text is a banded short/medium/long profile. It must NOT reach
    # system.damage: Foundry's Roll parses "/" as division, so "d14/d10/d7" evaluates to
    # 1d14 / 1d10 / 1d7 and totals about 1, silently.
    banded = base if '/' in base else ''
    primary = base.split('/')[0].strip() if banded else base

    gun = {
        'name': name,
        'kind': kind,
        'caliber': row['caliber'],
        'actionType': row['actionType'],
        'ammo': row['ammo'],
        # A single valid Foundry formula. Bare "d10" is normalised to "1d10".
        'damage': re.sub(r'^d', '1d', primary) if primary.startswith('d') else primary,
        'bandedDamage': banded,
        'secondBarrelDamage': second_barrel,
        'meleeNote': melee_note,
        'rof': row['rof'],
        'load': row['load'],
        'reloadTime': row['reloadTime'],
        'range': row['range'],
        'conceal': conceal,
        'price': price_value,
        'priceText': price_text,
        'year': '',
    }
    if fixed_from:
        gun['nameFixedFrom'] = fixed_from
    if cite:
        gun['cite'] = cite
    return gun


def v6_years(v6):
    """Map model name -> year from V6's wider copy of the advanced tables."""
    years = {}
    for raw in v6[15990:16060]:
        text = raw.strip()
        if not text.startswith('|'):
            continue
        cells = [clean(c) for c in text.strip('|').split('|')]
        if len(cells) < 12 or not cells[0] or cells[0].upper().startswith('MODEL'):
            continue
        if re.fullmatch(r'\d{4}', cells[11]):
            years[cells[0]] = cells[11]
    return years


def main():
    # A --check without the books skips loudly; a regenerate still needs them.
    if not require(RG, V6, soft=('--check' in sys.argv)):
        return
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()

    data = build()
    rendered = json.dumps(data, indent=2, ensure_ascii=False) + '\n'

    if args.check:
        current = TARGET.read_text(encoding='utf-8') if TARGET.exists() else ''
        if current != rendered:
            sys.exit(f'{TARGET.relative_to(REPO)} does not match the books — '
                     f'run tools/build_firearms.py')
        print(f'ok   {TARGET.relative_to(REPO)}: {len(data["guns"])} firearms match the books '
              f'(both printings agree)')
        return

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(rendered, encoding='utf-8')
    counts = {}
    for gun in data['guns']:
        counts[gun['kind']] = counts.get(gun['kind'], 0) + 1
    print(f'wrote {TARGET.relative_to(REPO)}: {len(data["guns"])} firearms ' + str(counts))


if __name__ == '__main__':
    main()
