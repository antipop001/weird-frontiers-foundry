# Building and releasing `wfvtt`

Two commands. Everything else here is the *why*.

```bash
npm run bump -- 0.3.0          # its own commit, clean tree required
npm run dist                   # gate + build dist/wfvtt-0.3.0.zip
```

---

## 1. Why there is no CI release workflow

Every sibling in the DCC family releases through a GitHub Action fired by a commit touching
`version.txt`. This module deliberately does not, for one concrete reason:

**`npm run verify` cannot run in CI.** Most of its checks re-derive the shipped data from the Weird
Frontiers books, and those books are not in the repository and never will be — they are a commercial
product. A CI job could lint and zip, but it could not run the gate that actually protects the data.
A release pipeline whose gate is a strict subset of the local one is worse than no pipeline: it
*looks* like backpressure and isn't.

So the build runs on a machine that has the books, and `tools/make_release.py` refuses to produce a
zip unless the full gate is green.

## 2. Why `manifest` / `download` are absent from `module.json`

Foundry's install-by-URL needs both, and they are deliberately empty.

Pointing them at a repository that does not host a built artifact gives Foundry a URL that 404s, and
a failing update check logs an error on **every startup**. So the keys stay absent and the module is
installed by unzipping (§4). If you do host the artifacts somewhere — a LAN web server, an S3
bucket, a release asset — write the URLs with:

```bash
npm run bump -- 0.3.0 --release-base https://example.com/wfvtt/v0.3.0
# writes manifest: .../module.json  and  download: .../wfvtt.zip
npm run bump -- 0.3.0 --clear-urls      # and back again
```

`tools/bump_version.py --check` asserts the URLs name the current version, so a stale `v0.2.0` URL
on a `0.3.0` manifest is caught rather than shipped.

## 3. What the zip contains, and how that is proved

**Files at the zip root, no wrapping folder** — the Foundry convention.

The file set is a **whitelist** (`SHIP_FILES` / `SHIP_DIRS` in `tools/make_release.py`), not a list
of exclusions. A blacklist fails open: add a scratch directory and it ships. This repo can hold
`reference/` (upstream clones) and `corpus/` (your copy of the books, which is not yours to
redistribute), so the default has to be *not shipped*.

Ships: `module.json`, `LICENSE.txt`, `README.md`, `module/`, `lang/`, `styles/`, `templates/`,
`assets/`, and the compiled LevelDB of each pack `module.json` declares.

Then — the part that matters — the builder **reopens the zip it just wrote** and asserts that every
path anything declares is really inside: each `esmodules` entry, each `styles[].src`, each
`languages[].path`, the `license`, each declared pack (with a `*.ldb`, a `CURRENT` and a
`MANIFEST-*`, i.e. compiled LevelDB and not the JSON source), every `templates/*.html` string found
in the module source, and every `modules/wfvtt/...` asset referenced from a pack source. Plus the
negatives: no `reference/`, `corpus/`, `tools/`, `specs/`, `docs/`, `data/`, no pack `src/`, no
`LOCK`, no `*.pdf`, no `.env`.

The reason for that last group is worth stating. A check can be sound and still have the wrong
*extent*: every other check in this project asks "is the value right?", and none of them asks "is
the FILE as complete as it needs to be?" A zip missing one declared pack or one card image looks
perfectly healthy and fails at load time with no useful error.

And because a sweep that has never found anything is not known to be *able* to,
`tools/make_release.py --self-test` builds eighteen deliberately-broken zips — drop an esmodule,
drop one card, ship a pack as JSON, leak a `LOCK`, leak a PDF, drift the version — and fails unless
**every** assertion fires. It also runs a control on the real file set first, so a check that
rejects everything is not mistaken for a working one. It is part of `npm run verify`.

## 4. Installing the zip

```bash
mkdir -p <foundry-data>/Data/modules/wfvtt
unzip -o dist/wfvtt-<version>.zip -d <foundry-data>/Data/modules/wfvtt
```

The directory **must** be `wfvtt` — it matches the module id, and changing it orphans every install
and every saved sheet choice.

Restart Foundry afterwards. The server caches the compendium list per session, so new packs do not
appear until it restarts.

**Keep any backup of the previous directory outside `Data/modules/`.** Foundry scans every directory
there, and a `wfvtt.old` sitting next to `wfvtt` logs
`Invalid module "wfvtt" detected in directory "wfvtt.old"` on every boot.

## 5. Version discipline

`tools/bump_version.py` writes all three places the version lives — `version.txt`, `module.json`,
`package.json` — and `--check` (part of `npm run verify`) fails if they ever disagree.

It **refuses to run on a dirty tree**. The bump is its own commit, never folded into a feature
change: the upstream DCC release tooling omits the bump-carrying commit from generated release notes,
so a folded bump makes the feature vanish from its own release.

**Never re-cut a published version.** Rebuilding a zip for a version someone may already have
installed means two different artifacts answer to one version number. Bump instead.

## 6. A note on distributing builds

A built zip contains the compiled compendium packs, and those are generated from the Weird Frontiers
books. Distributing that zip distributes their content.

Building it for your own table is using your own copy of a book you bought. Handing it to other
people is republishing someone else's work, and it needs the rights holder's permission. See
[LICENSE.txt](../LICENSE.txt).
