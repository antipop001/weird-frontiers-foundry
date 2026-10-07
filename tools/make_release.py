#!/usr/bin/env python3
"""Build a Foundry-installable wfvtt release zip, and prove it is complete.

Layout follows upstream: files at the ZIP ROOT, no wrapping folder
(reference/dcc/docs/dev/PRERELEASE_PROCESS.md -- "the packaged system, files
at the zip root, no wrapping folder").

The file set is a WHITELIST, not a list of exclusions. A blacklist fails open:
add a new top-level directory of scratch work and it ships. This repo has
several directories that must never leave it -- `reference/` (upstream clones
pulled for comparison), `corpus/` (your own copy of the books, which is not
ours to redistribute), and anything matching the secret patterns in .gitignore
-- so the default is "not shipped".

Then it ASSERTS, against the built zip, that every path module.json declares
is actually in there: esmodules, styles, languages, the license, and each
declared pack (compiled LevelDB, not the JSON source). It also resolves every
`templates/...` string in the module source and every `modules/wfvtt/...`
asset reference in the pack sources.

That last part is the point. A check can be sound and still have the wrong
EXTENT: every check on this module's data asks "is the value right?", and none
of them asks "is the FILE as complete as it needs to be?" A zip missing one
declared pack, or one card image, looks perfectly fine and fails at load time
with no useful error.

  tools/make_release.py                 # full gate, then build
  tools/make_release.py --skip-gate     # build only (iterating)
  tools/make_release.py --out /somewhere/else
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE_ID = 'wfvtt'

# Top-level entries that ship. Everything else is left behind by default.
# NOTICE.md ships with the module, not just with the repository: anyone handed a built zip is
# holding the Weird Frontiers content and needs to see whose it is and on what terms.
SHIP_FILES = ['module.json', 'LICENSE.txt', 'NOTICE.md', 'README.md']
SHIP_DIRS = {
    'module': {'.js', '.mjs'},
    'lang': {'.json'},
    'styles': {'.css'},
    'templates': {'.html'},
    'assets': None,          # None == any extension
}

# Never ship, even from inside a whitelisted directory.
PRUNE_NAMES = {'LOCK', 'src', '__pycache__', '.DS_Store'}
PRUNE_GLOBS = ['*.pdf', '*.scss', '*.map', '.env*', '*.key', '*.pem', 'LOG', 'LOG.old']


def run(cmd, what):
    print(f'--- {what}: {" ".join(cmd)}')
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        print(f'FAIL: {what} exited {r.returncode}', file=sys.stderr)
        sys.exit(r.returncode)


def pruned(path: pathlib.Path) -> bool:
    if path.name in PRUNE_NAMES:
        return True
    return any(path.match(g) for g in PRUNE_GLOBS)


def collect():
    """Return [(abs_path, arcname)] for everything that ships."""
    out = []
    for name in SHIP_FILES:
        p = ROOT / name
        if not p.is_file():
            print(f'FAIL: {name} is declared shippable but does not exist', file=sys.stderr)
            sys.exit(1)
        out.append((p, name))

    for d, exts in SHIP_DIRS.items():
        base = ROOT / d
        if not base.is_dir():
            print(f'FAIL: {d}/ is declared shippable but does not exist', file=sys.stderr)
            sys.exit(1)
        for p in sorted(base.rglob('*')):
            if not p.is_file():
                continue
            if any(pruned(part) for part in [p] + list(p.parents)[:-1]):
                continue
            if exts is not None and p.suffix not in exts:
                continue
            out.append((p, str(p.relative_to(ROOT))))

    # Packs: only the ones module.json declares, compiled LevelDB only.
    mod = json.loads((ROOT / 'module.json').read_text())
    for pack in mod.get('packs', []):
        base = ROOT / pack['path']
        if not base.is_dir():
            print(f'FAIL: module.json declares pack {pack["name"]!r} at '
                  f'{pack["path"]}, which does not exist. Run `npm run todb`.',
                  file=sys.stderr)
            sys.exit(1)
        for p in sorted(base.rglob('*')):
            if not p.is_file() or pruned(p):
                continue
            if 'src' in p.relative_to(base).parts:
                continue
            out.append((p, str(p.relative_to(ROOT))))
    return out


def referenced_templates():
    refs = set()
    for p in (ROOT / 'module').rglob('*'):
        if p.suffix in ('.js', '.mjs'):
            refs |= set(re.findall(r'templates/[A-Za-z0-9_.\-/]+\.html', p.read_text()))
    return refs


def referenced_assets():
    refs = set()
    for p in (ROOT / 'packs').rglob('src/*.json'):
        for m in re.findall(rf'modules/{MODULE_ID}/([A-Za-z0-9_.\-/]+)', p.read_text()):
            refs.add(m)
    return refs


def verify_zip(zpath, version):
    """Assert the built zip is complete against everything that declares a path."""
    with zipfile.ZipFile(zpath) as z:
        names = set(z.namelist())
        mod = json.loads(z.read('module.json'))

    fails = []

    def need(path, why):
        if path not in names:
            fails.append(f'{why}: {path} is NOT in the zip')

    if 'module.json' not in names:
        fails.append('module.json is not at the zip root (Foundry will not see it)')
    if mod.get('version') != version:
        fails.append(f'zip module.json version {mod.get("version")!r} != version.txt {version!r}')
    if mod.get('id') != MODULE_ID:
        fails.append(f'zip module.json id is {mod.get("id")!r}, expected {MODULE_ID!r}')

    for e in mod.get('esmodules', []):
        need(e, 'declared esmodule')
    for s in mod.get('styles', []):
        need(s['src'] if isinstance(s, dict) else s, 'declared style')
    for l in mod.get('languages', []):
        need(l['path'], f'declared language {l.get("lang")}')
    if mod.get('license'):
        need(mod['license'], 'declared license')
    # The attribution notice is not referenced from module.json, so assert it explicitly.
    need('NOTICE.md', 'attribution notice (NOTICE.md)')

    for pack in mod.get('packs', []):
        pref = pack['path'].rstrip('/') + '/'
        inside = {n for n in names if n.startswith(pref)}
        if not inside:
            fails.append(f'declared pack {pack["name"]!r}: nothing under {pref}')
            continue
        if not any(n.endswith('.ldb') for n in inside):
            fails.append(f'declared pack {pack["name"]!r}: no compiled *.ldb '
                         '(shipped the JSON source instead? run `npm run todb`)')
        if pref + 'CURRENT' not in inside:
            fails.append(f'declared pack {pack["name"]!r}: no CURRENT (LevelDB is incomplete)')
        if not any('MANIFEST-' in n for n in inside):
            fails.append(f'declared pack {pack["name"]!r}: no MANIFEST-* (LevelDB is incomplete)')

    for t in sorted(referenced_templates()):
        need(t, 'template referenced from module source')
    for a in sorted(referenced_assets()):
        need(a, 'asset referenced from a pack source')

    # Negative: things that must never ship.
    banned = {
        'reference/': 'upstream clones (50 MB, and not ours to redistribute)',
        'node_modules/': 'dev dependencies',
        'tools/': 'build tooling',
        'specs/': 'requirements',
        'docs/': 'developer docs',
        'data/': 'build-time inputs',
        'corpus/': 'your copy of the books, not ours to redistribute',
        '.git/': 'git internals',
        'CLAUDE.md': 'agent/editor instructions',
        'package.json': 'dev manifest',
        'version.txt': 'release bookkeeping',
    }
    for prefix, why in banned.items():
        hit = [n for n in names if n == prefix or n.startswith(prefix)]
        if hit:
            fails.append(f'{prefix} must not ship ({why}) -- found {len(hit)}, e.g. {hit[0]}')
    for pat, why in [(r'/src/', 'pack JSON sources'), (r'(^|/)LOCK$', 'a LevelDB LOCK'),
                     (r'\.pdf$', 'a PDF (copyrighted rulebook art)'),
                     (r'(^|/)\.env', 'a secrets file')]:
        hit = [n for n in names if re.search(pat, n)]
        if hit:
            fails.append(f'{why} must not ship -- found {len(hit)}, e.g. {hit[0]}')

    return fails, names


SELF_TESTS = [
    ('drop a declared esmodule', lambda n, m: (n - {'module/wfvtt.js'}, m),
     'declared esmodule'),
    ('drop the declared stylesheet', lambda n, m: (n - {'styles/wfvtt.css'}, m),
     'declared style'),
    ('drop the language file', lambda n, m: (n - {'lang/en.json'}, m),
     'declared language'),
    ('drop the license module.json names', lambda n, m: (n - {'LICENSE.txt'}, m),
     'declared license'),
    ('drop the attribution notice', lambda n, m: (n - {'NOTICE.md'}, m),
     'NOTICE.md'),
    ('drop one card image', lambda n, m: (n - {'assets/cards/spades-ace.webp'}, m),
     'asset referenced from a pack source'),
    ('drop one template', lambda n, m: (n - {'templates/item-sheet-wf-firearm.html'}, m),
     'template referenced from module source'),
    ('ship a pack as JSON source instead of LevelDB',
     lambda n, m: ({x for x in n if not (x.startswith('packs/wf-firearms/') and x.endswith('.ldb'))}
                   | {'packs/wf-firearms/src/gun.json'}, m),
     'no compiled *.ldb'),
    ('lose a pack CURRENT', lambda n, m: (n - {'packs/wf-gun-deck/CURRENT'}, m),
     'no CURRENT'),
    ('lose a pack MANIFEST', lambda n, m: ({x for x in n if 'packs/wf-gun-deck/MANIFEST-' not in x}, m),
     'no MANIFEST-'),
    ('drop a whole declared pack',
     lambda n, m: ({x for x in n if not x.startswith('packs/wf-crit-tables/')}, m),
     'nothing under packs/wf-crit-tables/'),
    ('leak a LevelDB LOCK', lambda n, m: (n | {'packs/wf-firearms/LOCK'}, m),
     'a LevelDB LOCK must not ship'),
    ('leak a rulebook PDF', lambda n, m: (n | {'assets/Weird_Frontiers.pdf'}, m),
     'a PDF (copyrighted rulebook art) must not ship'),
    ('leak a secrets file', lambda n, m: (n | {'.env'}, m), 'a secrets file must not ship'),
    ('leak the reference clones', lambda n, m: (n | {'reference/dcc/module.json'}, m),
     'reference/ must not ship'),
    ('leak the build tooling', lambda n, m: (n | {'tools/build_firearms.py'}, m),
     'tools/ must not ship'),
    ('leak the local corpus', lambda n, m: (n | {'corpus/Weird_Frontiers_V6.md'}, m),
     'corpus/ must not ship'),
    ('version drift between module.json and version.txt',
     lambda n, m: (n, {**m, 'version': '9.9.9'}), '!= version.txt'),
    ('wrong module id', lambda n, m: (n, {**m, 'id': 'notwfvtt'}), 'id is'),
]


def self_test(tmp):
    """Prove each completeness assertion fires.

    A sweep that has never found anything is not known to be ABLE to find anything, so the
    negative result it reports is worth nothing until it has been shown to catch a real defect.
    """
    version = (ROOT / 'version.txt').read_text().strip()
    real = [arc for _, arc in collect()]
    mod = json.loads((ROOT / 'module.json').read_text())

    # Control: the real file set must PASS, or every negative below is vacuous.
    ok_zip = tmp / 'control.zip'
    synth(ok_zip, real, mod)
    fails, _ = verify_zip(ok_zip, version)
    if fails:
        print('FAIL: self-test control (the real file set) does not pass:', file=sys.stderr)
        for f in fails:
            print(f'  - {f}', file=sys.stderr)
        return 1
    print(f'  control: real file set passes ({len(real)} files)')

    bad = 0
    for i, (label, mutate, expect) in enumerate(SELF_TESTS):
        names, m = mutate(set(real), mod)
        zp = tmp / f'case{i}.zip'
        synth(zp, sorted(names), m)
        fails, _ = verify_zip(zp, version)
        if any(expect in f for f in fails):
            print(f'  caught: {label}')
        else:
            bad += 1
            print(f'  MISSED: {label} -- expected a complaint containing {expect!r}, '
                  f'got {fails or "no complaints at all"}', file=sys.stderr)
    if bad:
        print(f'\nFAIL: {bad}/{len(SELF_TESTS)} completeness checks did not fire.',
              file=sys.stderr)
        return 1
    print(f'\nOK  all {len(SELF_TESTS)} completeness checks fire on a known-broken zip')
    return 0


def synth(path, arcnames, mod):
    """Write a zip with the given entry names; contents are placeholders except
    module.json, which the assertions actually parse."""
    with zipfile.ZipFile(path, 'w') as z:
        for a in arcnames:
            if a == 'module.json':
                continue
            z.writestr(a, b'x')
        z.writestr('module.json', json.dumps(mod))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--self-test', action='store_true',
                    help='prove the completeness assertions fire; build nothing')
    ap.add_argument('--out', default=str(ROOT / 'dist'), help='output directory (default: dist/)')
    ap.add_argument('--skip-gate', action='store_true',
                    help='skip lint/verify/todb (iterating on the packaging itself)')
    args = ap.parse_args()

    if args.self_test:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            return self_test(pathlib.Path(td))

    version = (ROOT / 'version.txt').read_text().strip()
    rc = subprocess.run([sys.executable, str(ROOT / 'tools' / 'bump_version.py'), '--check'],
                        cwd=ROOT)
    if rc.returncode != 0:
        print('FAIL: version fields disagree; run tools/bump_version.py <version> first',
              file=sys.stderr)
        return 1

    if not args.skip_gate:
        run(['npm', 'run', 'lint'], 'lint')
        # todb BEFORE verify, deliberately. The release self-test's control builds the real file
        # set and asserts it passes, which requires every pack module.json declares to have
        # compiled LevelDB -- so with verify first, ADDING a pack could never pass: verify would
        # fail on the missing .ldb that todb was about to produce. Safe in this order because
        # every ratchet in verify is a `--check` and regenerates nothing, so nothing can make the
        # packs stale after they are compiled.
        run(['npm', 'run', 'todb'], 'compile packs')
        run(['npm', 'run', 'verify'], 'verify (re-derive from the corpus)')
    else:
        print('--- skipping gate (--skip-gate)')

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    zpath = out / f'{MODULE_ID}-{version}.zip'
    if zpath.exists():
        zpath.unlink()

    entries = collect()
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, arc in entries:
            z.write(src, arc)

    fails, names = verify_zip(zpath, version)
    if fails:
        print(f'\nFAIL: the zip is incomplete ({len(fails)} problems):', file=sys.stderr)
        for f in fails:
            print(f'  - {f}', file=sys.stderr)
        zpath.unlink()
        print('\nzip deleted; nothing shipped.', file=sys.stderr)
        return 1

    size = zpath.stat().st_size
    print(f'\nOK  {zpath}')
    print(f'    {len(names)} files, {size / 1024 / 1024:.1f} MB, module.json at the zip root')
    mod = json.loads((ROOT / 'module.json').read_text())
    print(f'    version {version}, {len(mod["packs"])} packs, '
          f'{sum(1 for n in names if n.startswith("assets/"))} assets')
    print('\nInstall into a Foundry data dir:')
    print(f'  mkdir -p <data>/Data/modules/{MODULE_ID} && \\')
    print(f'    unzip -o {zpath} -d <data>/Data/modules/{MODULE_ID}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
