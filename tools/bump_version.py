#!/usr/bin/env python3
"""Bump the module version across the three files that carry it.

Upstream DCC hand-edits only `version.txt` and lets a GitHub Action sync the
rest (reference/dcc/docs/dev/RELEASE_PROCESS.md). We have no such Action --
`npm run verify` re-derives pack data from the Weird Frontiers corpus, which
lives outside the repo (see tools/corpus_paths.py) and is not
available to CI -- so the sync happens here instead.

  tools/bump_version.py 0.2.0
  tools/bump_version.py 0.2.0 --release-base https://github.com/antipop001/wfvtt/releases/download/v0.2.0
  tools/bump_version.py --check

`--release-base` writes module.json's `manifest`/`download`. It is opt-in:
this repo is private, so Foundry cannot fetch a manifest from it, and a
manifest URL that 401s makes Foundry report an update-check error on every
startup. Omit it and the keys stay absent, which is correct for a module that
is installed by unzipping.

Following the upstream DCC release convention, the bump is its own
commit -- never folded into a feature change -- so this refuses to run on a
dirty tree unless --force is given.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEMVER = re.compile(r'^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')


def read_version_txt():
    return (ROOT / 'version.txt').read_text().strip()


def load(name):
    return json.loads((ROOT / name).read_text())


def check():
    """Assert the three version fields agree. Returns a list of complaints."""
    bad = []
    txt = read_version_txt()
    if not SEMVER.match(txt):
        bad.append(f'version.txt is not semver: {txt!r}')
    for name in ('module.json', 'package.json'):
        got = load(name).get('version')
        if got != txt:
            bad.append(f'{name} version is {got!r}, version.txt says {txt!r}')
    mod = load('module.json')
    lic = mod.get('license')
    if lic and not (ROOT / lic).exists():
        bad.append(f'module.json license points at {lic!r}, which does not exist')
    for key in ('manifest', 'download'):
        url = mod.get(key)
        if url and f'/v{txt}/' not in url:
            bad.append(f'module.json {key} does not name v{txt}: {url}')
    return bad


def dirty():
    out = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT,
                         capture_output=True, text=True).stdout.strip()
    return [ln for ln in out.splitlines() if ln]


def write_json(name, obj):
    (ROOT / name).write_text(json.dumps(obj, indent=2) + '\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('version', nargs='?', help='new version, e.g. 0.2.0')
    ap.add_argument('--release-base', help='base URL for manifest/download assets')
    ap.add_argument('--clear-urls', action='store_true',
                    help='remove manifest/download from module.json')
    ap.add_argument('--check', action='store_true',
                    help='verify the version fields agree; change nothing')
    ap.add_argument('--force', action='store_true',
                    help='bump even though the working tree is dirty')
    args = ap.parse_args()

    if args.check:
        bad = check()
        for b in bad:
            print(f'FAIL: {b}', file=sys.stderr)
        if bad:
            return 1
        print(f'version {read_version_txt()} consistent across '
              'version.txt, module.json, package.json')
        return 0

    if not args.version:
        ap.error('a version is required unless --check is given')
    if not SEMVER.match(args.version):
        print(f'FAIL: {args.version!r} is not a semver string', file=sys.stderr)
        return 1

    changes = dirty()
    if changes and not args.force:
        print('FAIL: working tree is dirty. The version bump must be its own '
              'commit (upstream RELEASE_PROCESS.md: a bump folded into a '
              'feature commit is dropped from the generated release notes).',
              file=sys.stderr)
        for c in changes[:10]:
            print(f'  {c}', file=sys.stderr)
        print('Commit or stash first, or pass --force.', file=sys.stderr)
        return 1

    old = read_version_txt()
    (ROOT / 'version.txt').write_text(args.version + '\n')

    mod = load('module.json')
    mod['version'] = args.version
    if args.clear_urls:
        mod.pop('manifest', None)
        mod.pop('download', None)
    elif args.release_base:
        base = args.release_base.rstrip('/')
        mod['manifest'] = f'{base}/module.json'
        mod['download'] = f'{base}/wfvtt.zip'
    write_json('module.json', mod)

    pkg = load('package.json')
    pkg['version'] = args.version
    write_json('package.json', pkg)

    print(f'{old} -> {args.version}  (version.txt, module.json, package.json)')
    if mod.get('manifest'):
        print(f'  manifest: {mod["manifest"]}')
        print(f'  download: {mod["download"]}')
    else:
        print('  manifest/download: absent (install by unzipping; see docs/releasing.md)')
    bad = check()
    for b in bad:
        print(f'WARNING: {b}', file=sys.stderr)
    print('\nCommit this on its own:\n'
          f'  git commit -am "chore(release): {args.version}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
