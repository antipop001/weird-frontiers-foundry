# specs/

Frozen, REQ-ID'd requirements. These are the contract: an implementation task cites the
REQ-IDs it satisfies in its commit message (`Requirement:` line).

**Do not silently "improve" a requirement to make a task easier.** If one is wrong or
ambiguous, stop and surface it under "Needs clarification" in the spec rather than
reinterpreting it.

Every rules statement carries a corpus citation (`<file>:<line>` into
your corpus directory). A requirement without a citation is a design
decision, and is labelled as one.

**One exception, and it is deliberate:** `03-fear-madness.md` quotes **PDF page numbers**
(the rulebook PDF) rather than corpus lines for the Fear
rows. pdf2md splices the middle out of those cells, so the corpus text for them is not quotable —
see the header of `tools/build_fear_table.py`. Where the corpus is intact, cite the corpus.

| Spec | Covers |
|---|---|
| `01-actor-sheets.md` | Weird Frontiers Player and NPC character sheets — **17/17 done** |
| `02-gun-deck.md` | The 54-card Gun deck flipped on every shot — **11/11 done** |
| `03-fear-madness.md` | The Grit check, the Fear chart and the Madness bands — **8/8 done** |
| `04-combat.md` | Firearm combat modifiers: ROF, range bands, cover, reloading, concealment — **6/6 done** |
