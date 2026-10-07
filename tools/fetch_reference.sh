#!/usr/bin/env bash
# Re-clone the upstream DCC reference repos into ./reference/ (gitignored).
# These are read-only references — never edit them, never commit them.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p reference && cd reference
for r in dcc xcc dcc-gongfarmers-classes dcc-crawl-classes; do
  if [ -d "$r/.git" ]; then
    echo "== updating $r"; git -C "$r" pull --ff-only -q
  else
    echo "== cloning $r"; git clone --depth 50 -q "https://github.com/foundryvtt-dcc/$r.git"
  fi
done
du -sh ./*/
