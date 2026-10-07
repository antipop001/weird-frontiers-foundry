# Notice: Weird Frontiers content in this repository

**Weird Frontiers is © David Baity / Reroll Productions.** The game — its rules, its tables, its
text and its artwork — is their work and their property. This repository is not affiliated with
Reroll Productions, and nothing here is published with their permission.

## What is included, and why

This repository contains a Foundry VTT module that implements Weird Frontiers, and it includes the
**game data that module needs to run**: class progressions, the equipment and firearms tables, the
critical-hit and fumble charts, and the Fear and Madness tables. That data is generated from the
books by the scripts in `tools/`, and much of it reproduces the published text closely or exactly —
the chart entries in particular are the book's own prose.

It is included for two reasons, and no others:

1. **So the rights holders can evaluate it.** A module that ships without its data cannot be judged,
   played, or sensibly commented on. If Reroll Productions is going to decide whether they like
   this, want changes to it, want it taken down, or want to do something with it, they need to see
   the whole thing working.
2. **So it can be properly playtested.** Partial data gives useless playtest. The mechanics that
   most need testing — the Gun Deck, the Grit/Fear/Madness loop, the firearm rules — are exactly
   the ones that depend on the charts.

## What this is not

- **Not a public release.** This repository is private and shared by invitation.
- **Not a licence to redistribute.** Nothing here grants anyone the right to copy, host, fork or
  pass on the Weird Frontiers content, in this form or any other.
- **Not a replacement for the books.** The module is useless without a copy of Weird Frontiers to
  play with: it assumes you have the rules in front of you, and it deliberately leaves to the judge
  everything the rules leave to the judge.
- **Not a commercial thing.** Nobody is being charged for this and nobody intends to be.

## To the Weird Frontiers team

If you are reading this because it was sent to you: thank you for taking a look.

The honest position is that this was built first and permission asked second, which is the wrong
order, and that is why you are being shown it privately rather than finding it in the wild.

**If you want any of it removed, changed or taken down, say so and it will be done** — promptly, and
without argument. If you would rather the data were stripped out and only the code kept, that is
straightforward: `tools/` regenerates everything from the books, so the data can be removed and the
module still built by anyone who owns a copy. If you would like it developed differently, or taken
somewhere, that conversation is welcome too.

The generators carry citations back into the books for essentially every value, so if something is
wrong it can be traced to the passage it came from and fixed.

## Other attributions

Weird Frontiers is compatible with the **Dungeon Crawl Classics Role Playing Game**,
© Goodman Games. This module is a third-party add-on for the independently developed `dcc` Foundry
VTT system and is affiliated with neither Goodman Games nor Reroll Productions.

The card artwork under `assets/cards/` was generated for this project and is not from the books.
