# Notice: Weird Frontiers content in this repository

**Weird Frontiers is © David Baity / Reroll Productions.** The game — its rules, its tables, its
text and its artwork — is their work and their property. This project is not affiliated with Reroll
Productions, and **nothing here is published with their permission.**

## What is included, and why

This is a Foundry VTT module that implements Weird Frontiers, and it includes the **game data the
module needs to run**: class progressions, the equipment and firearms tables, the critical-hit and
fumble charts, and the Fear and Madness tables. That data is generated from the books by the scripts
in `tools/`, and much of it reproduces the published text closely or exactly — the chart entries in
particular are the book's own prose.

It is here because a module without its data cannot be run, played or sensibly judged. The
mechanics that most need testing — the Gun Deck, the Grit/Fear/Madness loop, the firearm rules — are
exactly the ones that depend on the charts.

**This repository is public.** That was a deliberate choice by its author, made so the module can be
installed and playtested, and made *before* asking Reroll Productions. That is the wrong order, and
this notice exists to say so plainly rather than to pretend otherwise.

## What this is not

- **Not licensed.** No permission is granted to anyone to redistribute the Weird Frontiers content,
  in this form or any other. The MIT licence in `LICENSE.txt` covers the *module code only* and
  grants nothing over the game content.
- **Not a replacement for the books.** The module is useless without a copy of Weird Frontiers to
  play with: it assumes the rules are in front of you, and it deliberately leaves to the judge
  everything the rules leave to the judge. **If you are using this, buy the game.**
- **Not commercial.** Nobody is being charged for this and nobody intends to be.
- **Not official.** Reroll Productions has had no part in it and bears no responsibility for it.

## Buy the game

Weird Frontiers is a commercial product from a small publisher. If this module is useful to you, the
right thing to do is pay its author for the work it implements. Look for Weird Frontiers RPG from
Reroll Productions.

## To the Weird Frontiers team

If you are reading this: thank you for taking a look, and sorry for the order of events.

**If you want any of this removed, changed, renamed or taken down, say so and it will be done** —
promptly, and without argument. Open an issue, or contact the repository owner through GitHub.

Some specific options, in case any of them are easier than a takedown:

- **Strip the data, keep the code.** `tools/` regenerates every value from the books, so the game
  data can be deleted and the module still built by anyone who owns a copy. This repository has
  been built and tested in exactly that configuration; it is a change of one `.gitignore` and a
  rebuild.
- **Correct it.** The generators carry citations back into the books for essentially every value, so
  anything wrong can be traced to the passage it came from and fixed.
- **Take it over**, or have it developed differently, or under your direction.

## Other attributions

Weird Frontiers is compatible with the **Dungeon Crawl Classics Role Playing Game**,
© Goodman Games. This module is a third-party add-on for the independently developed `dcc` Foundry
VTT system and is affiliated with neither Goodman Games nor Reroll Productions.

The card artwork under `assets/cards/` was generated for this project and is not from the books.
