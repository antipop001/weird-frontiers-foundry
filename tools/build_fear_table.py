#!/usr/bin/env python3
"""Extract the Fear table and the Madness bands into data/fear_madness.json.

THE SOURCE IS THE PDF, NOT THE CORPUS MARKDOWN, AND THAT IS THE POINT.

A markdown conversion of the rulebook is NOT good enough for these rows, and the way it fails is
the point. Converters drop the MIDDLE of a long prose cell and splice the head to the tail, so the
row for `8` comes out as "Since there's no bed to source of your fear" -- a grammatical sentence
with a whole clause missing and no ellipsis to show it. A
does-every-row-end-in-a-full-stop check PASSES on that, which is exactly why the damage is easy to
miss: truncation at a column width is visible, a mid-cell splice is not.

The PDF text layer has all 30 rows whole, so this reads the PDF directly. If your rulebook PDF is
a scan with no text layer you will need to OCR it first; the generator will tell you when the rows
it finds do not look complete.

CROSS-CHECK. The Reference Guide prints 9 of the 30 rows (`# FEAR AND MADNESS` onward). Every one
of them must be a PREFIX of the PDF row with the same roll, after normalisation. That is what
catches a mis-parse -- a row assembled from the wrong lines would not prefix-match -- and it is
only possible because the book prints the table twice. Same technique as
`tools/build_crit_tables.py`.

    tools/build_fear_table.py            # regenerate
    tools/build_fear_table.py --check    # verify the committed file, change nothing
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import unicodedata

REPO = pathlib.Path(__file__).resolve().parent.parent
# Source locations live in corpus_paths so there is one place to configure them, and so the
# candidate list is shared rather than duplicated per tool.
import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from corpus_paths import PDF_CANDIDATES, RG, find_pdf, require  # noqa: E402

PDF = find_pdf() or PDF_CANDIDATES[0]
TARGET = REPO / 'data' / 'fear_madness.json'

# The pages are found by content, not hardcoded, but only a window is read: pdftext spawns
# poppler once per call and the book is 908 pages.
WINDOW = (138, 156)

# A roll label is a line that is ONLY the label. The next line must start like prose, which keeps
# a stray numeral inside a cell from being read as a new row.
LABEL_RE = re.compile(r'^(1 or less|\d{1,2}\+?)$')
PROSE_RE = re.compile(r'^[A-Z“"“]')
BAND_RE = re.compile(r'^(\d{1,3})-(\d{1,3})%\s*:\s*(.+?)\s*$')
DEFN_RE = re.compile(r'^(Minor phobia|Minor disorder|Major phobia|Major disorder):\s*(.*)$')
PAGE_RE = re.compile(r'^--- page (\d+)/\d+ ---$')

# Roll labels in printed order. Note 30 rows, not 31: there is no row for 0.
EXPECTED_ROLLS = ['1 or less'] + [str(n) for n in range(2, 30)] + ['30+']

NOISE = {'WEIRD FRONTIERS', 'CORE RULEBOOK', 'FEAR TABLE', 'FEAR TABLE (CONT.)',
         'ROLL', 'RESULT', 'Fear Chart', 'Madness'}


def norm(text):
    """Fold the typographic differences between the two printings."""
    t = unicodedata.normalize('NFKD', text)
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'),
                 ('—', '-'), ('–', '-'), ('…', '...')):
        t = t.replace(a, b)
    return re.sub(r'\s+', ' ', t).strip().lower()


# SHA-256 of the RULES CONTENT of data/fear_madness.json -- the `fear` and `madness` objects,
# canonically serialised, excluding `source` (which holds absolute paths and page numbers: facts
# about where the data came from, not about what it says).
#
# This exists because the PDF lives OUTSIDE the repo and outside the corpus, in a conversion
# pipeline's staging directory, and on 2026-10-04 it was gone after a host storage change --
# taking `npm run verify` red with it. Sourcing a load-bearing ratchet from
# `pdf2md/done/` was a mistake: `done/` is where a pipeline parks finished input, not a canon
# store. The corpus directory is the documented canon location; that survived.
#
# So when the PDF is absent, `--check` falls back to proving the committed data has not DRIFTED
# since it was derived and gate-approved. That is a strictly weaker claim than re-derivation and
# the output says so in those words -- it must never be mistaken for "verified against the book".
CONTENT_DIGEST = '9a4fbde2f1bb6a305a636e216416f9b40b389a33ad29b6110095a629194366da'


def content_digest(data):
    """Digest of the rules content, stable against changes to `source`."""
    payload = json.dumps({'fear': data['fear'], 'madness': data['madness']},
                         sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def pdf_pages():
    """{page_number: [lines]} for the window, via poppler's pdftotext."""
    found = find_pdf()
    if not found:
        sys.exit('could not find Weird_Frontiers_V6.pdf in any of:\n' +
                 ''.join(f'  {c}\n' for c in PDF_CANDIDATES) +
                 'The Fear table is only complete in the PDF text layer -- the corpus markdown\n'
                 'drops the middle of long cells. Restore the PDF or re-run pdf2md.')
    out = subprocess.run(['pdftext', str(found), str(WINDOW[0]), str(WINDOW[1])],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f'pdftext failed ({out.returncode}): {out.stderr.strip()[:300]}')
    pages, cur = {}, None
    for line in out.stdout.splitlines():
        m = PAGE_RE.match(line.strip())
        if m:
            cur = int(m.group(1))
            pages[cur] = []
        elif cur is not None:
            pages[cur].append(line.rstrip())
    return pages


def parse_rows(lines):
    """Roll label on its own line, wrapped prose beneath it, until the next label."""
    rows, roll, buf = [], None, []
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or line in NOISE:
            continue
        nxt = next((x.strip() for x in lines[i + 1:] if x.strip()), '')
        if LABEL_RE.match(line) and PROSE_RE.match(nxt):
            if roll is not None:
                rows.append((roll, ' '.join(buf)))
            roll, buf = line, []
            continue
        if roll is not None:
            buf.append(line)
    if roll is not None:
        rows.append((roll, ' '.join(buf)))
    return [(r, re.sub(r'\s+', ' ', t).strip()) for r, t in rows]


def bounds(roll):
    """Foundry RollTable needs numeric bounds; the printed labels are open-ended."""
    if roll == '1 or less':
        return -999, 1
    if roll.endswith('+'):
        return int(roll[:-1]), 999
    return int(roll), int(roll)


def rg_rows():
    """The Reference Guide's 9 rows, from its `# FEAR AND MADNESS` section."""
    text = RG.read_text()
    start = text.index('# FEAR AND MADNESS')
    end = text.index('BLEEDING OUT', start)
    found = {}
    for line in text[start:end].splitlines():
        m = re.match(r'^\|\s*(1 or less|\d{1,2}\+?)\s*\|\s*(.+?)\s*\|?\s*$', line)
        if m and m.group(1) in EXPECTED_ROLLS:
            found.setdefault(m.group(1), m.group(2).strip())
    return found


def build():
    pages = pdf_pages()
    fear_pages = sorted(p for p, ls in pages.items()
                        if any(l.strip() == 'FEAR TABLE' or l.strip() == 'FEAR TABLE (CONT.)'
                               for l in ls))
    if len(fear_pages) != 2:
        sys.exit(f'expected 2 FEAR TABLE pages in {WINDOW}, found {fear_pages}. '
                 'A different printing? Widen WINDOW or re-check the page numbers.')
    madness_pages = [p for p, ls in pages.items()
                     if any(l.strip() == 'Madness' for l in ls)
                     and any(BAND_RE.match(l.strip()) for l in ls)]
    if len(madness_pages) != 1:
        sys.exit(f'expected 1 Madness page in {WINDOW}, found {madness_pages}')

    # --- Fear: the two printings are a page-break CONTINUATION, so concatenate, never diff.
    rows = []
    for p in fear_pages:
        rows += parse_rows(pages[p])
    got = [r for r, _ in rows]
    if got != EXPECTED_ROLLS:
        missing = [r for r in EXPECTED_ROLLS if r not in got]
        extra = [r for r in got if r not in EXPECTED_ROLLS]
        sys.exit(f'fear rolls do not match the printed sequence.\n'
                 f'  missing: {missing}\n  unexpected: {extra}\n  got {len(got)} rows')

    # Completeness. The measurement that declared this blocked, applied to the PDF instead.
    stubs = [r for r, t in rows if not t.rstrip().endswith(('.', '!', '?', '"', '”'))]
    if stubs:
        sys.exit(f'{len(stubs)} fear rows do not end in sentence-final punctuation: {stubs}')

    # Cross-check against the Reference Guide printing.
    rg = rg_rows()
    if len(rg) < 9:
        sys.exit(f'expected >=9 Reference Guide fear rows for the cross-check, found {len(rg)}')
    by_roll = dict(rows)
    for roll, rg_text in sorted(rg.items(), key=lambda kv: bounds(kv[0])):
        a, b = norm(rg_text), norm(by_roll[roll])
        if not b.startswith(a):
            sys.exit(f'cross-check FAILED for fear roll {roll}: the Reference Guide text is not a '
                     f'prefix of the PDF text.\n  RG:  {rg_text[:160]}\n  PDF: {by_roll[roll][:160]}')

    # --- Madness: four d% bands plus the four definitions.
    mlines = [l.strip() for l in pages[madness_pages[0]] if l.strip()]
    bands = []
    for line in mlines:
        m = BAND_RE.match(line)
        if m:
            bands.append({'printed_min': int(m.group(1)), 'printed_max': int(m.group(2)),
                          'label': m.group(3)})
    if [b['label'] for b in bands] != ['Minor Phobia', 'Minor Disorder',
                                       'Major Phobia', 'Major Disorder']:
        sys.exit(f'unexpected Madness bands: {[b["label"] for b in bands]}')

    # Each band's definition paragraph. The band heading is Title Case ("Minor Phobia") and the
    # definition below it is sentence case ("Minor phobia:"), so the two are joined through an
    # explicit map rather than by guessing at capitalisation.
    defns, key, buf = {}, None, []
    for line in mlines:
        m = DEFN_RE.match(line)
        if m:
            if key:
                defns[key] = ' '.join(buf).strip()
            key, buf = m.group(1), [m.group(2)]
        elif key and line.startswith('A Word on'):
            defns[key] = ' '.join(buf).strip()
            key = None
        elif key and not BAND_RE.match(line):
            buf.append(line)
    if key:
        defns[key] = ' '.join(buf).strip()

    # The DC is the cheap, unambiguous discriminator: the two phobia bands differ ONLY in DC and
    # in "minor"/"major", so a mis-paired definition is otherwise near-invisible. Minor and Major
    # phobia share DC15/DC12 asymmetry -- assert the exact pairing.
    BAND_DEFN = {'Minor Phobia': ('Minor phobia', 'DC12'),
                 'Minor Disorder': ('Minor disorder', 'DC15'),
                 'Major Phobia': ('Major phobia', 'DC15'),
                 'Major Disorder': ('Major disorder', 'DC17')}
    for b in bands:
        printed, dc = BAND_DEFN[b['label']]
        if printed not in defns:
            sys.exit(f'no definition paragraph for Madness band {b["label"]!r} '
                     f'(looked for {printed!r}); have {sorted(defns)}')
        text = re.sub(r'\s+', ' ', defns[printed]).strip()
        if f'permanent {b["label"].lower()}' not in text.lower()[:90]:
            sys.exit(f'Madness band {b["label"]!r} got a definition that does not open by naming '
                     f'itself -- the paragraphs are mis-paired: {text[:120]!r}')
        if dc not in text:
            sys.exit(f'Madness band {b["label"]!r} definition does not carry {dc}: {text[:120]!r}')
        b['text'] = text

    # THE OUTER BANDS MUST BE OPEN-ENDED, and this is a real runtime hazard rather than tidiness.
    # The modifiers are FLAT PERCENTAGES applied to the d% roll -- "-10% for each +1 Luck modifier,
    # or +10% for each -1 Luck Modifier. Hex tokens impose a +10% modifier per hex" -- so a
    # character with +3 Luck takes -30% and a roll of 15 becomes -15, while -2 Luck and two Hexes
    # take +40% and a roll of 80 becomes 120. Entered at the printed 0-25 / 76-100 both of those
    # fall off the table and resolve to NOTHING, silently. Same reasoning as the Fear table's
    # "1 or less" and "30+" rows, which are already open at both ends.
    #
    # The printed bounds are kept alongside as `printed_min`/`printed_max` rather than discarded,
    # so the data stays quotable against the book.
    LOW, HIGH = -999, 999
    for i, b in enumerate(bands):
        b['min'] = LOW if i == 0 else b['printed_min']
        b['max'] = HIGH if i == len(bands) - 1 else b['printed_max']
    if (bands[0]['min'], bands[-1]['max']) != (LOW, HIGH):
        sys.exit('the outer Madness bands were not opened up')

    return {
        'source': {
            'pdf': str(find_pdf()),
            'fear_pages': fear_pages,
            'madness_page': madness_pages[0],
            'cross_checked_against': f'{RG.name} (# FEAR AND MADNESS), {len(rg)} rows',
            'why_not_the_corpus_markdown':
                'pdf2md drops the MIDDLE of long cells here and splices head to tail, so rows '
                'read as complete sentences with a clause missing. The PDF text layer is whole.'
        },
        'fear': {
            # V6 says this THREE times -- the Failure rule, the Critical failure rule, and the
            # Fear Chart intro -- and never mentions a die: the index IS the failure margin.
            # The Reference Guide alone says "Roll 1d20 modified by". Recorded as a conflict; see
            # docs/wf-mechanics-delta.md. The core rulebook wins by default.
            'index': 'grit-check-failure-margin',
            'modifiers': 'positive Luck modifiers subtract from the total; each Hex token adds +1',
            'conflict': {
                'v6': 'use the amount the Grit check failed by, modified by Luck and Hex tokens '
                      '(no die) -- stated at the Failure rule, the Critical failure rule and the '
                      'Fear Chart intro',
                'reference_guide': 'Roll 1d20 modified by the amount the Grit check failed by, '
                                   'plus Luck and Hex tokens',
                'resolution': 'V6 (the core rulebook) is the default; it states the rule three '
                              'times consistently. Needs a judge call to adopt the RG variant.'
            },
            'rows': [{'roll': r, 'min': bounds(r)[0], 'max': bounds(r)[1], 'text': t}
                     for r, t in rows]
        },
        'madness': {
            'trigger': 'reaching zero Grit during an adventure',
            'formula': '1d100',
            'modifiers': '-10% per +1 Luck modifier, +10% per -1 Luck modifier, '
                         '+10% per Hex token',
            'penalty': '-1d to all rolls for the remainder of the encounter',
            # `bands[i].min`/`max` are the EFFECTIVE bounds for a lookup, open-ended at both
            # ends because the modifiers are flat percentages that can push the roll outside
            # 0-100. `printed_min`/`printed_max` keep what the book prints.
            'bands': bands,
            'specific_affliction': 'DELIBERATELY not a table. An earlier draft had a random '
                                   'derangement chart; the author removed it so that no player '
                                   'is handed a condition they live with. The judge and group '
                                   'decide how it manifests.'
        }
    }


def main():
    # Fail with a message that names every missing input, before any parsing, since a
    # missing corpus is the first thing anyone cloning this repo will hit.
    require(RG)
    checking = '--check' in sys.argv

    # The PDF is an EXTERNAL dependency of this ratchet. Without it the data cannot be re-derived,
    # so a regenerate must fail outright -- but a `--check` can still prove the committed data has
    # not drifted, which is enough to keep the rest of the gate usable.
    if checking and not find_pdf():
        if not TARGET.exists():
            sys.exit(f'{TARGET.relative_to(REPO)} is missing and so is the PDF — nothing to check against')
        data = json.loads(TARGET.read_text())
        got = content_digest(data)
        if got != CONTENT_DIGEST:
            sys.exit(f'{TARGET.relative_to(REPO)} HAS CHANGED since it was derived from the book, and '
                     'the PDF is missing from every searched location so it cannot be re-derived.\n'
                     f'  expected digest {CONTENT_DIGEST}\n  got              {got}\n'
                     'Restore the PDF and re-run tools/build_fear_table.py, or revert the data file.')
        f, m = data['fear'], data['madness']
        print(f'ok   data/fear_madness.json: {len(f["rows"])} fear rows, {len(m["bands"])} madness '
              'bands, UNCHANGED since derivation (digest only)')
        print('WARN data/fear_madness.json was NOT re-derived from the book — the PDF is missing '
              'from every searched location:')
        for c in PDF_CANDIDATES:
            print(f'       {c}')
        print('     This proves the file has not drifted; it does NOT re-verify it against the '
              'rulebook. Restore the PDF to get the real check back.')
        return

    built = build()
    if checking:
        if not TARGET.exists():
            sys.exit(f'{TARGET.relative_to(REPO)} is missing — run tools/build_fear_table.py')
        if json.loads(TARGET.read_text()) != built:
            sys.exit(f'{TARGET.relative_to(REPO)} is out of date — run tools/build_fear_table.py')
        f, m = built['fear'], built['madness']
        print(f'ok   data/fear_madness.json: {len(f["rows"])} fear rows (all complete), '
              f'{len(m["bands"])} madness bands, cross-checked against the Reference Guide')
        return
    TARGET.write_text(json.dumps(built, indent=2, ensure_ascii=False) + '\n')
    f, m = built['fear'], built['madness']
    print(f'wrote {TARGET.relative_to(REPO)}: {len(f["rows"])} fear rows from PDF pages '
          f'{built["source"]["fear_pages"]}, {len(m["bands"])} madness bands')


if __name__ == '__main__':
    main()
