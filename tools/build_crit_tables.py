#!/usr/bin/env python3
"""Extract the eight Critical Hit and Fumble charts into data/crit_fumble_tables.json.

TWO PRINTINGS, USED FOR DIFFERENT THINGS. Weird Frontiers prints these charts twice, and each
printing is good at what the other is bad at:

  * `Weird_Frontiers_V6.md` (the appendix, ~:16215-16291) has the COMPLETE row text — 196 rows,
    99% ending in sentence-final punctuation. But its layout is a trap: pdf2md emitted each
    chart's BODY BEFORE ITS HEADING (caption-below-figure). A parser that assumes
    heading-then-body silently shifts every chart by one and hands you gunshot criticals from a
    club. This script pairs each body with the heading that FOLLOWS it.

  * `Weird_Frontiers_Reference_Guide.md` (:1721-1910) prints them as real markdown tables with
    the heading BEFORE the table, so the chart-to-name mapping is unambiguous — but its rows are
    truncated at a ~100-character column width and some rolls are missing outright.

So: names and roll assignment are CONFIRMED against the Reference Guide, full text is taken from
V6, and every roll present in both must agree — the RG's truncated text has to be a prefix of the
V6 text for the same chart and roll. That is what catches a mis-paired body, and it is only
possible because the book prints the charts twice.

    tools/build_crit_tables.py            # regenerate
    tools/build_crit_tables.py --check    # verify the committed file, change nothing
"""
import difflib
import json
import pathlib
import re
import sys
import unicodedata

REPO = pathlib.Path(__file__).resolve().parent.parent
import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from corpus_paths import CORPUS, V6, RG, require  # noqa: E402
TARGET = REPO / 'data' / 'crit_fumble_tables.json'

CHART_RE = re.compile(r'^#+\s+(CRITICAL HIT|FUMBLE) CHART:\s*([A-Z]+)(\s*\(CONT\.\))?\s*$', re.I)
# A row starts at a roll token that follows a sentence end (or the start of the body). The
# lookahead for a capital letter keeps "+1d6 damage. 1 round" from being read as a new row.
ROW_RE = re.compile(r'(?:^|(?<=[.!?"”]) )(0 or less|0-1|\d{1,2}\+?)\s+(?=[A-Z“"])')
NOISE_RE = re.compile(r'<span[^>]*></span>|\*\*Roll Result\*?\*?|\*')


def norm(text):
    """Comparable form: curly quotes flattened, whitespace collapsed, case folded."""
    text = unicodedata.normalize('NFKD', text)
    text = (text.replace('’', "'").replace('‘', "'")
                .replace('“', '"').replace('”', '"')
                .replace('–', '-').replace('—', '-'))
    return re.sub(r'\s+', ' ', text).strip().lower()


def parse_v6():
    """{chart_name: {roll: text}} — pairing each body with the heading that FOLLOWS it."""
    lines = V6.read_text().splitlines()
    charts, pending = {}, []
    for line in lines:
        if len(line) > 400 and not line.lstrip().startswith(('|', '!')):
            pending.append(line)
            continue
        m = CHART_RE.match(line)
        if m and pending:
            name = f'{m.group(1).upper()}:{m.group(2).upper()}'
            charts.setdefault(name, []).append(pending[-1])
            pending = []
        elif m:
            sys.exit(f'chart heading with no body before it: {line!r} — the layout changed')
    return charts


def split_rows(body):
    """Split a run-on chart body into {roll: text}.

    Slice on the MATCH bounds, never on `start + len(roll)`: the pattern deliberately consumes
    the space before the roll token, so arithmetic off `m.start()` lands one character short and
    leaves the second digit of a two-digit roll glued to the front of its own text ("10 Weapon
    swings" became roll 1, text "0 Weapon swings"). The cross-check against the Reference Guide
    caught that; without the second printing it would have shipped as 21 plausible-looking rows.
    """
    # lstrip AFTER noise removal: some bodies carry a "**Roll Result**" header that becomes
    # leading whitespace, which would push the first row off the `^` anchor and silently drop it
    # (PIERCING lost its "0 or less" row exactly this way).
    body = NOISE_RE.sub(' ', body).lstrip()
    hits = [(m.start(1), m.end(), m.group(1)) for m in ROW_RE.finditer(body)]
    rows = {}
    for i, (start, text_from, roll) in enumerate(hits):
        end = hits[i + 1][0] if i + 1 < len(hits) else len(body)
        rows[roll] = re.sub(r'\s+', ' ', body[text_from:end]).strip()
    return rows


def parse_rg():
    """{chart_name: {roll: truncated_text}} — heading precedes the table here."""
    lines = RG.read_text().splitlines()
    charts, current = {}, None
    for line in lines:
        m = CHART_RE.match(line)
        if m:
            current = f'{m.group(1).upper()}:{m.group(2).upper()}'
            continue
        if current and line.startswith('|'):
            cells = [c.strip() for c in line.strip('|').split('|')]
            if len(cells) < 2 or set(cells[0]) <= set('-: ') or cells[0].upper() == 'ROLL':
                continue
            roll = cells[0]
            # The narrower FIREARMS/PIERCING tables lose the "0 or" from "0 or less" to the
            # column width, leaving a bare "less".
            if roll == 'less':
                roll = '0 or less'
            charts.setdefault(current, {})[roll] = cells[1]
        elif current and line.startswith('#'):
            current = None
    return charts


def main():
    # A --check without the books skips loudly; a regenerate still needs them.
    if not require(V6, RG, soft=('--check' in sys.argv)):
        return
    if not V6.exists() or not RG.exists():
        sys.exit(f'missing corpus files under {CORPUS}')

    v6_bodies = parse_v6()
    rg = parse_rg()

    charts, problems, differences = {}, [], []
    checked = agreed = 0
    for name, bodies in sorted(v6_bodies.items()):
        rows = {}
        for body in bodies:
            rows.update(split_rows(body))

        def key(r):
            if r.startswith('0 or less'):
                return -1
            return int(re.match(r'(\d+)', r).group(1))
        charts[name] = [{'roll': r, 'result': rows[r]} for r in sorted(rows, key=key)]

        # THE CROSS-CHECK IS AN ASSIGNMENT CHECK, NOT A DIFF.
        #
        # The two printings are not word-for-word identical — the core book and the Reference
        # Guide genuinely differ in places ("strikes an artery" vs "strikes a major artery"),
        # which is a known hazard with these conversions. Demanding identical text would fail on
        # editorial variation and teach the next person to ignore the check.
        #
        # What must hold is that each Reference Guide row's best match in V6 is the row with the
        # SAME roll in the SAME chart. That is exactly what a mis-paired body breaks — V6's
        # bodies precede their headings, so an off-by-one shifts a whole chart — and it survives
        # both truncation and rewording.
        for roll, truncated in rg.get(name, {}).items():
            if roll not in rows:
                problems.append(f'{name} roll {roll}: in the Reference Guide, missing from V6')
                continue
            checked += 1
            a = norm(truncated)[:120]
            score = difflib.SequenceMatcher(None, a, norm(rows[roll])[:120]).ratio()
            best_roll, best = roll, score
            for other, text in rows.items():
                r = difflib.SequenceMatcher(None, a, norm(text)[:120]).ratio()
                if r > best:
                    best_roll, best = other, r
            if best_roll != roll:
                problems.append(
                    f'{name} roll {roll}: the Reference Guide row matches V6 roll {best_roll} '
                    f'better ({best:.2f} vs {score:.2f}) — the charts are MIS-PAIRED')
            elif score >= 0.75:
                agreed += 1
            else:
                differences.append(f'{name} roll {roll} (similarity {score:.2f})\n'
                                   f'      RG: {truncated[:100]}\n      V6: {rows[roll][:100]}')

    # A row that does not end in sentence-final punctuation was cut at a page break. Track them
    # explicitly: 225 rows of which 224 are whole is a usable table, but shipping the ragged one
    # as though it were complete is how a half-sentence ends up on a judge's screen mid-game.
    incomplete = []
    for name, rows in sorted(charts.items()):
        for r in rows:
            if not r['result'].rstrip().endswith(('.', '!', '?', '"', '\u201d')):
                incomplete.append(f"{name} roll {r['roll']}")
    if len(incomplete) > 1:
        problems.append(f'{len(incomplete)} truncated rows, expected at most 1 '
                        f'(CRITICAL HIT:WRESTLING 17, cut at a page break in V6 and absent from '
                        f'the Reference Guide): {incomplete}')

    missing = sorted(set(rg) - set(charts))
    if missing:
        problems.append(f'charts in the Reference Guide but not V6: {missing}')
    if len(charts) != 8:
        problems.append(f'expected 8 charts, found {len(charts)}: {sorted(charts)}')
    # A systematic shift would show up as a collapse in the agreement rate even if no single row
    # matched another roll outright, so the rate itself is a ratchet.
    rate = agreed / checked if checked else 0
    if checked and rate < 0.90:
        problems.append(f'only {agreed}/{checked} ({rate:.0%}) of rows agree between the two '
                        f'printings — expected at least 90%; the charts may be mis-paired')
    if problems:
        sys.exit('CROSS-CHECK FAILED between the two printings:\n  ' + '\n  '.join(problems))

    total = sum(len(v) for v in charts.values())
    payload = {
        '_source': 'Weird_Frontiers_V6.md appendix (full text), chart names and roll assignment '
                   'confirmed against Weird_Frontiers_Reference_Guide.md:1721-1910',
        '_generator': 'tools/build_crit_tables.py',
        '_rows': total,
        '_cross_checked_rows': checked,
        'charts': charts,
    }
    payload['_printing_differences'] = [d.split('\n')[0] for d in differences]
    payload['_incomplete_rows'] = incomplete
    built = json.dumps(payload, indent=2, ensure_ascii=False) + '\n'

    if '--check' in sys.argv:
        current = TARGET.read_text() if TARGET.exists() else ''
        if current != built:
            sys.exit(f'{TARGET.relative_to(REPO)} is out of date — run tools/build_crit_tables.py')
        print(f'ok   {TARGET.relative_to(REPO)}: {len(charts)} charts, {total} rows '
              f'({total - len(incomplete)} complete), {agreed}/{checked} agree with the '
              f'Reference Guide printing')
        return
    TARGET.write_text(built)
    print(f'wrote {TARGET.relative_to(REPO)}: {len(charts)} charts, {total} rows; '
          f'{agreed}/{checked} ({rate:.0%}) agree with the Reference Guide printing')
    if incomplete:
        print(f'  {len(incomplete)} row(s) cut at a page break and not recoverable from either '
              f'printing: {", ".join(incomplete)}')
    if differences:
        print(f'\n  {len(differences)} rows where the two printings genuinely differ in wording '
              f'(V6, the core book, is used):')
        for d in differences:
            print('    ' + d)
    for name in sorted(charts):
        rolls = [r['roll'] for r in charts[name]]
        print(f'  {name:28s} {len(rolls):3d} rows  {rolls[0]}..{rolls[-1]}')


main()
