#!/usr/bin/env python3
"""Check lang/en.json for key collisions that make Foundry discard the whole file.

Foundry EXPANDS flat dotted keys into a nested object, so a key cannot be both a leaf and a
branch. Shipping both

    "WF.Firearm.DamageType":      "Damage type"     <- leaf
    "WF.Firearm.DamageType.None": "-"               <- branch of the same path

makes expansion throw `Cannot create property 'None' on string 'Damage type'`, and Foundry then
drops EVERY key in the file — not just the two that clash. The symptom is nothing localizing at
all, which reads like the module failing to load rather than one bad pair of keys.

This ran as a one-off fix and is now part of `npm run verify` so it cannot regress.
"""
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
LANG = REPO / 'lang'


def check(path):
    keys = list(json.loads(path.read_text(encoding='utf-8')))
    collisions = []
    for key in keys:
        prefix = key + '.'
        children = [k for k in keys if k.startswith(prefix)]
        if children:
            collisions.append((key, children))
    return collisions


def main():
    failed = False
    for path in sorted(LANG.glob('*.json')):
        collisions = check(path)
        if collisions:
            failed = True
            print(f'FAIL {path.relative_to(REPO)}')
            for key, children in collisions:
                shown = ', '.join(children[:3]) + ('…' if len(children) > 3 else '')
                print(f'    {key!r} is a leaf AND a branch of: {shown}')
                print('      Foundry will discard the ENTIRE file. Rename one side.')
        else:
            count = len(json.loads(path.read_text(encoding='utf-8')))
            print(f'ok   {path.relative_to(REPO)}: {count} keys, no leaf/branch collisions')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
