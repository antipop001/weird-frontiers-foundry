#!/usr/bin/env python3
"""Generate module/wf-monster-crit-data.mjs from the monster crit/fumble die chart.

Source: `Weird_Frontiers_V6.md`, the "CREATURES HD | CRITICAL HIT/ FUMBLE DIE" table that
follows "Use a creature's HD to determine the appropriate die rolled for both critical hits and
fumbles by referencing the chart below."

This is one of the few wide tables in this corpus that came through the pdf2md pass INTACT — all
23 rows parse, none is truncated — which is why it can be generated rather than hand-copied. The
crit/fumble CHARTS themselves (REQ-SHEET-015) are a different matter and remain blocked.

    tools/build_monster_crits.py            # regenerate
    tools/build_monster_crits.py --check    # verify the committed file, change nothing
"""
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from corpus_paths import CORPUS, V6, RG, require  # noqa: E402
CORPUS = V6  # this tool reads the core rulebook only
TARGET = REPO / 'module' / 'wf-monster-crit-data.mjs'

HEADER_RE = re.compile(r'\|\s*CREATURES HD\s*\|\s*CRITICAL HIT/\s*FUMBLE DIE\s*\|')
ROW_RE = re.compile(r'^\|\s*(Less than 1|\d+\+?)\s*\|\s*D(\d+)\s*/\s*D(\d+)\s*\|\s*$')


def parse():
    if not CORPUS.exists():
        sys.exit(f'missing {CORPUS}')
    lines = CORPUS.read_text().splitlines()
    start = next((i for i, l in enumerate(lines) if HEADER_RE.search(l)), None)
    if start is None:
        sys.exit('could not find the "CREATURES HD | CRITICAL HIT/ FUMBLE DIE" table header')

    rows = []
    for i in range(start + 1, min(start + 40, len(lines))):
        line = lines[i].strip()
        if line.startswith('|--') or not line:
            continue
        m = ROW_RE.match(line)
        if not m:
            break
        label, crit, fumble = m.group(1), m.group(2), m.group(3)
        if label == 'Less than 1':
            hd = 0
        else:
            hd = int(label.rstrip('+'))
        rows.append({'hd': hd, 'label': label, 'crit': f'1d{crit}', 'fumble': f'1d{fumble}',
                     'line': i + 1})

    # The chart runs "Less than 1", then 1..20, then "21+" — 22 rows. Anything else means the
    # table changed or the parse drifted, and silently shipping a short table is the failure
    # worth preventing. (This guard earned its keep immediately: it caught 23 being asserted
    # here when the chart has 22.)
    if len(rows) != 22:
        sys.exit(f'expected 22 rows in the monster crit chart, parsed {len(rows)} '
                 f'(starting at line {start + 1}) — re-read the table before regenerating')
    if [r['hd'] for r in rows] != list(range(0, 21)) + [21]:
        sys.exit(f'unexpected HD sequence: {[r["hd"] for r in rows]}')
    return rows, start + 1


def build(rows, header_line):
    # `standard` forbids a trailing comma on the last element and multiple spaces before a
    # comment, so the separator and the spacing are built rather than pasted.
    def entry(r, last):
        note = {'Less than 1': ' // "Less than 1"', '21+': ' // "21+"'}.get(r['label'], '')
        return f"  {{ hd: {r['hd']}, crit: '{r['crit']}', fumble: '{r['fumble']}' }}" \
               f"{'' if last else ','}{note}"

    entries = '\n'.join(entry(r, i == len(rows) - 1) for i, r in enumerate(rows))
    return f'''/**
 * Monster critical-hit and fumble dice by Hit Dice — GENERATED, do not hand-edit.
 *
 * Regenerate with tools/build_monster_crits.py; `npm run verify` re-derives this from the book
 * and fails if it drifts.
 *
 * Source: Weird_Frontiers_V6.md:{header_line} — "Use a creature's HD to determine the appropriate
 * die rolled for both critical hits and fumbles by referencing the chart below."
 *
 * The book prints these as "D4/D14"; they are written here as Foundry dice formulas ('1d4',
 * '1d14'), which is the same die in the notation the rest of this module and the system use.
 *
 * Note the fumble die runs the OPPOSITE way to the crit die: a tougher creature crits harder
 * (d4 -> d30) and fumbles less badly (d14 -> d3). A single "bigger is better" assumption would
 * get one of the two backwards.
 */

/** Indexed by the chart's HD rows: index 0 is "Less than 1", index 21 is "21+". */
export const MONSTER_CRIT_TABLE = [
{entries}
]

/**
 * The crit and fumble dice for a creature with `hd` Hit Dice.
 *
 * @param {{number}} hd - hit dice as a number; fractional or 0 selects the "Less than 1" row.
 * @returns {{{{crit: string, fumble: string}}}} dice formulas
 */
export function monsterCritDice (hd) {{
  const n = Number(hd)
  if (!Number.isFinite(n) || n < 1) return MONSTER_CRIT_TABLE[0]
  return MONSTER_CRIT_TABLE[Math.min(Math.floor(n), 21)]
}}

/**
 * Hit Dice as a NUMBER, from the string DCC stores in `system.attributes.hitDice.value`.
 *
 * That field is free text and holds things like '5d8', '1d4+2', '½', '2' — the count before the
 * 'd' is the HD, which is what the chart is keyed on. Returns null when nothing parses, so a
 * caller can show nothing rather than silently treating an unreadable value as 0 HD.
 *
 * @param {{string}} value
 * @returns {{number|null}}
 */
export function parseHitDice (value) {{
  const s = String(value ?? '').trim()
  if (!s) return null
  if (/^(½|1\\/2)/.test(s)) return 0.5
  const m = s.match(/^(\\d+(?:\\.\\d+)?)/)
  return m ? Number(m[1]) : null
}}
'''


def main():
    # A --check without the books skips loudly; a regenerate still needs them.
    if not require(CORPUS, soft=('--check' in sys.argv)):
        return
    rows, header_line = parse()
    built = build(rows, header_line)
    if '--check' in sys.argv:
        current = TARGET.read_text() if TARGET.exists() else ''
        if current != built:
            sys.exit(f'{TARGET.relative_to(REPO)} is out of date — run tools/build_monster_crits.py')
        print(f'ok   {TARGET.relative_to(REPO)}: {len(rows)} monster crit rows match the book')
        return
    TARGET.write_text(built)
    print(f'wrote {TARGET.relative_to(REPO)} ({len(rows)} rows from V6:{header_line})')


main()
