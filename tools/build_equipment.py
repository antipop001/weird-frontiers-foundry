#!/usr/bin/env python3
"""Extract the melee, ranged and general-store tables into data/equipment.json.

    tools/build_equipment.py            # (re)generate
    tools/build_equipment.py --check    # verify the committed file still matches the books

Three tables, three different hazards:

MELEE (`Reference_Guide.md:1380-1421`) — clean. The only trap is `Halberd`, whose damage prints
as `d10/d6` (slashing or piercing). That must not reach `system.damage`: Foundry's Roll parses
"/" as division.

RANGED, non-firearm (`Reference_Guide.md:1423-1437`) — one row is split across THREE lines with
its name missing entirely. It is Dynamite, resolved from V6's intact copy at
`Weird_Frontiers_V6.md:15668`.

GENERAL STORE (`Reference_Guide.md:2228-2500`) — the messiest in the corpus. Seventeen
sub-tables with 2, 3, 4 or 6 columns; rows carrying two or three items side by side; category
labels sitting in a spacer row above the header rather than in a heading; two headers that have
swallowed a data row ("Jam (jar) $0.10"), the same way the derringers table did; and the whole
block reprinted two or three times in different column groupings as the converter split page
columns. Rather than model that, every (name, cost) pair in the region is harvested and then
deduplicated — which turns the repeated printings into a consistency check instead of a problem.
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
TARGET = REPO / 'data' / 'equipment.json'

MELEE = (1380, 1421)
RANGED = (1423, 1437)
# Starts at the first store label, NOT at the "# THE GENERAL STORE" heading: the Livery's
# statted mount table sits between them, and harvesting it produced categories like
# "INIT 0 +2 +1 0 -1 +1". The Livery is a mount table, not a price list, and belongs with the
# mounts work (REQ-SHEET-0xx), not here.
STORE = (2226, 2500)

# The three-line fragment in the ranged table, resolved from V6's intact row.
# The weapon table prints Dynamite's damage as "see pg 147" rather than dice, but the rules it
# points at are unambiguous: "A standard stick of dynamite inflicts a base 4d6 damage to all
# targets within a 50' area (DC 12 Reflex save for half damage if you can take cover). Each
# additional stick increases damage by +1d and adds 20' to the area of effect."
# — `Weird_Frontiers_V6.md:3379`, word for word identical at `Reference_Guide.md:2017`.
#
# A "6d6" appears at `Weird_Frontiers_V6.md:14509`, and this project previously recorded that as
# a canon conflict. It is not: that line sits inside an NPC's stat block (after "splint, box of
# matches, $16 cash") and is footnote-marked with a "*" as a variant for that NPC's bundle. The
# base item is 4d6.
DYNAMITE = {
    'name': 'Dynamite',
    'damage': '4d6',
    'damageNote': 'Table prints "see pg 147"; base 4d6 in a 50\' area, DC 12 Ref for half, '
                  '+1d and +20\' per extra stick',
    'damageType': '*',
    'range': '10/20/30',
    'weight': 0.05,
    'priceText': '$.50 per stick',
    'price': 0.5,
    'notes': 'Explosives. See page 147 for use.',
    'cite': 'Weird_Frontiers_V6.md:15668 (table row); damage Weird_Frontiers_V6.md:3379',
}

PRICE = re.compile(r'^\$?\s*([\d.]+)')
# A cost cell: "$0.50", "5 per acre", "13". Rules out a name that merely starts with a digit.
COST_LIKE = re.compile(r'^\$?\s*[\d.]+(\s*(per|/)\s*\w+)?$', re.I)


def clean(cell):
    return (cell.replace('\\$', '$')
                .replace('’', "'").replace('‘', "'")
                .replace('“', '"').replace('”', '"')
                .replace(' ', ' ').strip())


def table_lines(lo, hi):
    lines = RG.read_text(encoding='utf-8').split('\n')
    for n in range(lo, min(hi, len(lines)) + 1):
        text = lines[n - 1].strip()
        if not text.startswith('|'):
            yield n, None
            continue
        cells = [clean(c) for c in text.strip('|').split('|')]
        if set(''.join(cells)) <= set('-: '):
            continue
        yield n, cells


def parse_price(text):
    match = PRICE.match(text)
    return (float(match.group(1)) if match else 0.0), text


def split_damage(raw):
    """`d10/d6` -> ('1d10', 'd10/d6'). A "/" must never reach system.damage."""
    text = clean(raw)
    alt = text if '/' in text else ''
    primary = text.split('/')[0].strip() if alt else text
    if primary.startswith('d'):
        primary = '1' + primary
    return (primary if re.fullmatch(r'\d*d\d+([+-]\d+)?', primary) else ''), alt


def build_weapons(problems):
    melee, ranged = [], []
    for _, cells in table_lines(*MELEE):
        if not cells or cells[0].upper() == 'WEAPON' or not cells[0]:
            continue
        damage, alt = split_damage(cells[1])
        if not damage:
            problems.append(f'melee {cells[0]!r}: damage {cells[1]!r} is not a formula')
        price, price_text = parse_price(cells[4])
        melee.append({
            'name': cells[0], 'damage': damage, 'altDamage': alt,
            'damageType': cells[2], 'weight': float(cells[3]) if cells[3] else 0.0,
            'price': price, 'priceText': price_text,
            'notes': cells[5] if len(cells) > 5 else '',
        })

    for _, cells in table_lines(*RANGED):
        if not cells or cells[0].upper() == 'WEAPON':
            continue
        if not cells[0]:
            continue  # the Dynamite fragment; supplied from V6 below
        damage, alt = split_damage(cells[1])
        price, price_text = parse_price(cells[5])
        ranged.append({
            'name': cells[0], 'damage': damage, 'altDamage': alt, 'damageNote': '',
            'damageType': cells[2], 'range': cells[3],
            'weight': float(cells[4]) if cells[4] else 0.0,
            'price': price, 'priceText': price_text,
            'notes': cells[6] if len(cells) > 6 else '',
        })
    ranged.append(dict(DYNAMITE, altDamage=''))
    ranged.sort(key=lambda w: w['name'])
    return melee, ranged


def build_goods(problems):
    """Harvest every (name, cost) pair in the store region, then deduplicate.

    Rows hold one, two or three items side by side, so cells are walked in pairs. A pair counts
    as an item when the second cell looks like a cost and the first is a non-empty name. That
    single rule copes with every column count in the region AND recovers items swallowed into a
    header row, which is how "Jam (jar) $0.10" is caught.

    CATEGORIES ARE PER COLUMN, not per table. A multi-column table carries several categories
    side by side — `| Sundries | | Home/Farm Needs | | Animals | |` — so a single running
    category leaks across them: an earlier version put 81 items under "Entertainment" (a
    six-row table) and lost "Clothing & Accessories (Men)" entirely. A label row therefore maps
    COLUMN INDEX -> label, and each item takes the nearest label at or left of its own column.
    Labels reset when a table ends, so one table's headings cannot bleed into the next.
    """
    goods = {}
    col_categories = {}

    def category_for(column):
        """The category governing a given column.

        A label set with ONE label is a centred table title and governs every column — the
        "Clothing & Accessories (Ladies)" label sits in column 2 while the items it titles start
        in column 0, so a nearest-label-to-the-left rule assigned them nothing. Several labels
        are per-group headings that really do align with their columns
        (`| Sundries | | Home/Farm Needs | | Animals | |`), so there the alignment is used.
        """
        if not col_categories:
            return ''
        if len(col_categories) == 1:
            return next(iter(col_categories.values()))
        candidates = [c for c in col_categories if c <= column]
        return col_categories[max(candidates)] if candidates else ''

    rows = [cells for _, cells in table_lines(*STORE) if cells is not None]

    def is_header(cells):
        return any(c.upper() in ('ITEM', 'COST') or
                   re.fullmatch(r'(ITEM|COST)(\s+(ITEM|COST))*', c.upper())
                   for c in cells if c)

    for index, cells in enumerate(rows):
        upper = [c.upper() for c in cells]

        def usable(i):
            """A candidate name or label: not a price, not an ITEM/COST header cell."""
            cell = cells[i]
            return bool(cell) and upper[i] not in ('ITEM', 'COST') \
                and not re.fullmatch(r'(ITEM|COST)(\s+(ITEM|COST))*', upper[i]) \
                and not COST_LIKE.match(cell)

        # A usable cell followed by a PRICE is an item. A usable cell followed by an EMPTY cell
        # is ambiguous — it is either a column label or an item name the converter wrapped onto
        # its own line ("Town Lot (double cost for prime"). The discriminator is LOOKAHEAD: a
        # real label is followed by an ITEM/COST header row, because that is what a table
        # heading sits above. Without that test, wrapped names became categories and displaced
        # the real ones — Pharmacy, Entertainment and Smokes & Chews vanished entirely.
        labelish = is_header(rows[index + 1]) if index + 1 < len(rows) else False

        labels, items = {}, []
        # Iterate over EVERY cell, not len-1: a centred single-column title is the LAST cell in
        # its row (`| | Accessories |`) with nothing after it. Stopping one short meant those
        # labels were never examined, and Pharmacy, Entertainment, Accessories and
        # Smokes & Chews silently ended up under whatever category preceded them.
        for i in range(len(cells)):
            if not usable(i):
                continue
            following = cells[i + 1] if i + 1 < len(cells) else ''
            if COST_LIKE.match(following):
                items.append((i, cells[i], following))
            elif following == '' and labelish:
                labels[i] = cells[i]

        if labels:
            # Labels sharing a row with items are per-column headings and merge in; a row of
            # labels alone starts a fresh set.
            col_categories = {**col_categories, **labels} if items else labels

        for column, name, cost in items:
            price, price_text = parse_price(cost)
            category = category_for(column)
            # Key on name+price, NOT name+price+category. The block is reprinted two or three
            # times in different column fragmentations, and a printing whose label row was split
            # away yields the same item with no category. Keying on the category would keep both
            # copies and leave one orphaned; merging keeps the best label seen in any printing.
            key = (name, price_text)
            existing = goods.get(key)
            if existing:
                existing['printings'] += 1
                if len(category) > len(existing['category']):
                    existing['category'] = category
            else:
                goods[key] = {'name': name, 'price': price, 'priceText': price_text,
                              'category': category, 'printings': 1}

    # A conversion artifact would show up as ONE item priced two ways in ONE category. The same
    # name at different prices in DIFFERENT categories is the book being the book: a Belt is
    # $0.50 under "Clothing & Accessories (Ladies)" and $0.75 under "(Men)", and a Cigar is
    # $0.20 at saloon prices and $0.10 in the store. So the check is scoped per category —
    # unscoped, it flagged five legitimate pairs and blocked the build.
    by_key = {}
    for item in goods.values():
        by_key.setdefault((item['category'], item['name']), set()).add(item['priceText'])
    for (category, name), prices in by_key.items():
        if len(prices) > 1:
            problems.append(f'goods {name!r} in {category!r}: the printings disagree on price '
                            f'({", ".join(sorted(prices))})')

    return sorted(goods.values(), key=lambda g: (g['category'], g['name']))


def build():
    problems = []
    melee, ranged = build_weapons(problems)
    goods = build_goods(problems)
    if problems:
        for p in problems:
            print(f'  {p}', file=sys.stderr)
        sys.exit(f'{len(problems)} problem(s) extracting equipment — refusing to write data')
    return {
        'source': {
            'melee': 'Weird_Frontiers_Reference_Guide.md:1380-1421',
            'ranged': 'Weird_Frontiers_Reference_Guide.md:1423-1437',
            'goods': 'Weird_Frontiers_Reference_Guide.md:2228-2500',
            'dynamite': DYNAMITE['cite'],
            'note': 'Regenerate with tools/build_equipment.py; never hand-edit.',
        },
        'melee': melee, 'ranged': ranged, 'goods': goods,
    }


def main():
    # A --check without the books skips loudly; a regenerate still needs them.
    if not require(RG, soft=('--check' in sys.argv)):
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
                     f'run tools/build_equipment.py')
        print(f'ok   {TARGET.relative_to(REPO)}: {len(data["melee"])} melee, '
              f'{len(data["ranged"])} ranged, {len(data["goods"])} goods match the books')
        return
    TARGET.write_text(rendered, encoding='utf-8')
    print(f'wrote {TARGET.relative_to(REPO)}: {len(data["melee"])} melee, '
          f'{len(data["ranged"])} ranged, {len(data["goods"])} goods')


if __name__ == '__main__':
    main()
