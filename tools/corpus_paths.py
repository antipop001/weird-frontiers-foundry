#!/usr/bin/env python3
"""Where the Weird Frontiers source material lives — one place, configurable.

THIS MODULE EXISTS BECAUSE THE DATA IS NOT IN THE REPO AND CANNOT BE. Weird Frontiers is a
commercial product; its text belongs to its author. The generators in this directory rebuild
`data/*.json` and the compendium sources from *your own* copy of the books, so you need to supply
that copy.

What the generators need, and why:

  * **Markdown conversions** of the rulebook and the Reference Guide. Most tables are parsed out of
    these. Produced by running the PDFs through a PDF-to-markdown converter that preserves tables
    (the project used `pdf2md`; `marker` and similar tools produce comparable output). Table
    fidelity varies between converters, and the generators assert heavily on what they find, so a
    conversion that mangles a table will fail loudly rather than emit wrong data.
  * **The rulebook PDF itself**, for the Fear and Madness charts. Those rows are long prose cells
    and markdown converters tend to drop the MIDDLE of such a cell and splice the head to the tail,
    leaving a grammatical sentence with a clause missing. The PDF text layer has them whole, so
    `build_fear_table.py` reads the PDF directly and cross-checks the markdown printing.

Point the tools at your files with either an environment variable or the default layout:

    export WF_CORPUS_DIR=/path/to/your/converted/corpus     # default: <repo>/corpus
    export WF_RULEBOOK_PDF=/path/to/Weird_Frontiers.pdf     # default: $WF_CORPUS_DIR/<v6 name>

Expected filenames inside the corpus directory (override individually if yours differ):

    WF_V6_MD   default 'Weird_Frontiers_V6.md'                 the core rulebook
    WF_RG_MD   default 'Weird_Frontiers_Reference_Guide.md'    the reference guide

`corpus/` is gitignored. Nothing derived from the books is redistributed by this repository.
"""
import os
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent

CORPUS = pathlib.Path(os.environ.get('WF_CORPUS_DIR', REPO / 'corpus'))
V6_NAME = os.environ.get('WF_V6_MD', 'Weird_Frontiers_V6.md')
RG_NAME = os.environ.get('WF_RG_MD', 'Weird_Frontiers_Reference_Guide.md')

V6 = CORPUS / V6_NAME
RG = CORPUS / RG_NAME

# Searched in order. A single hardcoded path is brittle: the PDF tends to live wherever the
# conversion pipeline left it, and that moves.
PDF_CANDIDATES = [
    pathlib.Path(p) for p in ([os.environ['WF_RULEBOOK_PDF']] if os.environ.get('WF_RULEBOOK_PDF') else [])
] + [
    CORPUS / pathlib.Path(V6_NAME).with_suffix('.pdf').name,
    CORPUS / 'Weird_Frontiers.pdf',
    REPO / 'corpus' / 'Weird_Frontiers_V6.pdf',
]


def find_pdf():
    """The first PDF candidate that exists, or None. `None` is a supported state."""
    return next((c for c in PDF_CANDIDATES if c.is_file()), None)


def require(*paths, soft=False):
    """True when every input is present.

    With `soft=True`, a missing input prints a WARN and returns False instead of exiting. That is
    for `--check` runs by someone who does not have the books: they cannot re-derive the data, and
    failing the whole gate would stop them building an installable module at all. The warning says
    in those words that the data was NOT re-verified, so a skipped check is never mistaken for a
    passed one.
    """
    missing = [p for p in paths if not pathlib.Path(p).is_file()]
    if not missing:
        return True
    if soft:
        print('WARN not re-derived — missing source material:')
        for m in missing:
            print(f'       {m}')
        return False
    sys.exit(
        'missing source material:\n' +
        ''.join(f'  {p}\n' for p in missing) +
        '\nThe Weird Frontiers text is not redistributed with this repository — you need your own\n'
        'copy of the books, converted to markdown. See tools/corpus_paths.py for the layout and\n'
        'the WF_CORPUS_DIR / WF_RULEBOOK_PDF environment variables.'
    )
