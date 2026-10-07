# 01 — Weird Frontiers actor sheets (Player and NPC)

Status: **partly implemented.** Raised 2026-09-12. All thirteen classes now ship.

| Requirement | State |
|---|---|
| REQ-SHEET-001 Path | **done** — schema + sheet track, verified live |
| REQ-SHEET-001a Walking-the-Line progression | **done** — `path.lineLevels` counter, +1/+2/+3/+1d, applies against any Path; not applied off the Line |
| REQ-SHEET-013a 0-level fumble/crit dice | **done** — a registered "Frontier Folk" sheet identifies a WF funnel character per-actor; d14 fumble via effect, d6 crit stored |
| REQ-SHEET-015 Crit/fumble tables by damage type | **done** — 8 RollTables in `wfvtt.wf-crit-tables`, resolved by damage type through DCC's own lookup; one fumble chart at a time is a platform limit |
| REQ-SHEET-002 Grit | **done** — stored starting total, erosion, retirement |
| REQ-SHEET-003 Boons/Hexes | **done** — counters plus the four derived Hex modifiers, verified live |
| REQ-SHEET-004 Dinero | **done** — coin block replaced by a single Dinero column on a forked goods partial; editable in one place only |
| REQ-SHEET-005 Firearm fields | **done** — `flags.wfvtt.firearm` + a Firearm tab on weapon items; unblocks the firearms compendium |
| REQ-SHEET-010 One WF common part | **done** |
| REQ-SHEET-011 Official field set | **done** — every widget on the published sheet: Path track, Grit, Dinero, Fumble Die, the five free-text areas, and the Signature Weapons block (derived from starred weapon items, not re-typed) |
| REQ-SHEET-012 Level-scaled AC | **done** — `+1 per level` via a managed Active Effect on `ac.otherMod`; stacks with the player's own modifier, plain DCC actors unaffected |
| REQ-SHEET-013 Fumble die | **done** — applied as an Active Effect, synced on class/level change; verified d12 at 1st to d3 at 10th |
| REQ-SHEET-014 No armor block | **done** — armor section dropped from a forked equipment tab; sub-tab relabelled "Weapons" |
| REQ-SHEET-020 NPC sheet registered | **done** — `wfvtt-npc`, subclasses DCC's, never makeDefault |
| REQ-SHEET-021 Stat block order / Path | **done** — alignment replaced by the book's Path code, stored losslessly on `details.path.code` |
| REQ-SHEET-022 Derived crit/fumble dice | **done** — generated from the HD chart and ratcheted; crit table named by attack type, free text with suggestions |
| REQ-SHEET-023 Fear DC computed | **done** — shows `8 + HD`, names the Hex term it cannot know |

DCC's stock sheets cannot show a Weird Frontiers character. Grit, Boons/Hexes, the Path and
dollars have no fields at all; the firearm columns have no home; and the NPC sheet prints an
alignment where WF prints a Path. This spec covers both sheets.

## Background — where the seams are

Verified against `reference/dcc/` @ 0.70.50 on 2026-09-12:

- A class's sheet is assembled from **parts** registered via `game.dcc.registerSheetPart`.
  `DCCActorSheet.PARTS` (`module/actor-sheet.js:116-123`) supplies a base `character` part
  pointing at `actor-partial-npc-common.html`; each class's `CLASS_PARTS` overrides it
  (`module/actor-sheet.js:298`), which is how the built-ins swap in `actor-partial-pc-common.html`
  (`module/built-in-sheet-parts.mjs:33-34`).
  **Consequence: pointing our `commonParts()` at our own partial re-skins every WF class at once.**
- NPC sheets are registered with `registerActorSheet('NPC', DCCActorSheet, { makeDefault: true })`
  (`module/init-hook.mjs:289`). A WF NPC sheet is a subclass registered the same way.
- New fields reach the schema through two hooks: `dcc.defineBaseActorSchema`
  (`module/data/actor/base-actor.mjs:291`) for anything Player **and** NPC need, and
  `dcc.definePlayerSchema` (`module/data/actor/player-data.mjs:165`) for Player-only fields.

## Requirements — schema

**REQ-SHEET-001 — Path replaces alignment, on both actor types.**
The Path "replaces the standard alignment system found in the DCC RPG"
(`Weird_Frontiers_V6.md:618`). It has three states — Path of the Righteous / Walking the Line /
Path of the Damned (`:880-924`) — and a rank, recorded as a track reading
`DAMNED +1d, +3, +2, +1, THE LINE, +1, +2, +3, +1d RIGHTEOUS` (`CharacterSheet_FF.md:17-19`).
The official sheet prints nine labels but gives only **seven checkboxes** (-3 … THE LINE … +3);
the two `+1d` end states have no box (`docs/official-sheet-field-map.md`). Model the full
**-4 … +4** range so the `+1d` ends — which the rules do describe, and which cost a reaffirming
deed each level to hold (`Weird_Frontiers_V6.md:942`) — are expressible. Default to THE LINE:
"characters begin the game by walking the line between the two paths"
(`Weird_Frontiers_V6.md:996`).
Add via `dcc.defineBaseActorSchema`: a state field and an integer rank. Monster stat blocks carry
it too, in place of `AL` (`Weird_Frontiers_V6.md:11291-11295`).
*The rank is an audience-dependent social modifier, not a universal bonus (`:944-950`) — store it,
do not apply it automatically.*

**REQ-SHEET-001a — Walking the Line has its own progression. DONE.**
The track position alone does not describe a WtL character. `Weird_Frontiers_V6.md:950`, in full:
"Characters that can successfully keep centered in their attitude are rewarded by a +1 modifier
at first-level when dealing with folks of any Path. They progress with this bonus for each level
they can maintain the Line (+2 at the next level, +3 at the level after, and +1d caps the bonus).
**If at any point they stray from WtL, they lose this bonus and instead take the bonus from the
Path they now follow.**"

So WtL needs a **second counter — levels maintained at the Line** — separate from the track
position, and its modifier applies against *everyone*, unlike PoR/PoD which are audience-scoped
(`:946` "common townsfolk and lawmen", `:948` "the seedier elements of a town, including
criminals").

Implemented as `system.details.path.lineLevels`, a Player-only NumberField capped at 4 because
"+1d caps the bonus" closes the progression. Manual, like Boons and Hexes: whether a character
maintained the Line across a level is a judgement about play. The sheet derives 1→+1, 2→+2, 3→+3,
4→+1d and shows the scope ("with folks of any Path") beside it.

*Straying LOSES the bonus, it does not pause it.* "They progress with this bonus for each level
they can **maintain** the Line … If at any point they stray from WtL, they **lose** this bonus"
(`:950`) — "maintain" makes it an unbroken streak, so a character who strays and later returns
starts again at +1 rather than resuming. The sheet flags the broken streak and asks the user to
clear the count; it does **not** wipe it automatically, because nudging a track radio should not
destroy a typed number. The rule is expressed in the UI text, not enforced by deleting data.

*The `+1d` cap needs no reaffirming deed.* `:944` requires one deed per level to hold a `+1d`, but
that paragraph is about "Characters reaching the end of a **chosen path**" who "circle the path
name (**Righteous or Damned**)". Walking the Line is the centre of the track, not the end of a
path, and its own sentence describes its `+1d` without a deed. *(Both readings confirmed by the
review; the first was corrected by it.)*

> **An earlier version of this entry said the reset rule was unknown** — "a rule for when it resets
> (presumably on leaving the Line — the text does not say, so this is a Needs clarification item
> too)". It does say, in the last sentence of the very line the entry cites. `:950` is one long
> markdown line and only its first half was read. Third instance of that error in this repo; see
> the project README.

**REQ-SHEET-002 — Grit, Player only.**
`(Sta + Per) / 2` rounded down (`Weird_Frontiers_V6.md:608`, `:3221`). A fluctuating pool with a
separate permanent maximum that erodes: hitting 0 in an adventure costs 1 permanent Grit
(`:3245`, `:3247`), and a permanent 0 retires the character (`:3251`). Needs current **and**
permanent-max fields. Monsters have no Grit field (`docs/wf-mechanics-delta.md` §9).

**REQ-SHEET-003 — Boons and Hexes, Player only. DONE.** *(rules-driven, not sheet-driven — the
official sheet has no box for these; we add them because other rules read them.)*
Two integer counters, `system.attributes.boons` and `.hexes`, min 0. Player-only is explicit
canon rather than an inference: "The author recommends that judges keep Boons and Hexes
exclusive to players and not use the mechanic with the enemies the group faces"
(`Weird_Frontiers_V6.md:3193`).

**Deliberately NOT auto-awarded.** A Boon comes on a natural 20 and a Hex on a natural 1 — but
both reverse "in a check where a lower result is better" (`Weird_Frontiers_V6.md:3199`, `:3209`),
which is a judgement about what the roll was for that no hook can make. They are poker chips at
the table; they are counters here.

**Each Hex is an input to four other rules** (`Weird_Frontiers_V6.md:3211`): a cumulative +1d on
any fumble chart, -1d on NPC interaction, +1 to the Grit-check DC, and +10% on Madness rolls.
None of that is automated, so the sheet derives and displays all four whenever the character
holds a Hex, and shows nothing when they hold none. Boons are spent freely and need no
derivation (`:3203`). Nat 20 grants a Boon, nat 1 a Hex (`Weird_Frontiers_V6.md:3199`, `:3211`).
Hexes feed other formulas (+1 to Grit-check DC and +10% Madness per token), so they must be
readable by other code, not free text.

**REQ-SHEET-004 — Currency is dollars.**
WF uses decimal US dollars to the cent (`Weird_Frontiers_Reference_Guide.md:2226-2503`); there is
no cp/sp/gp/ep/pp. DCC's `CurrencyField` is five integer coin fields
(`reference/dcc/module/data/fields/currency-field.mjs`). Add a dollars field and hide the coin
block on WF sheets. *Do not delete the coin fields* — they are on the base schema and a plain DCC
world in the same install still needs them.

**DONE.** `system.currency.dinero` is on the Player schema and displayed on the character tab; the
equipment tab's treasure list is a generated fork (`actor-partial-wf-goods.html`) whose five coin
columns became one Dinero column, taking the grid from 8 columns to 4.

**The money field is editable in exactly ONE place, and that is load-bearing.** The first version
put an editable input on both tabs. A sheet is a single `<form>` and the equipment part renders
*after* the character part, so on submit the stale equipment value overwrote an edit just made on
the character tab — verified live, the character-tab edit wrote 0. The equipment row is now a
read-only `<div>`: `readonly` would not have helped (readonly inputs still submit) and `disabled`
reads as a broken field.

**REQ-SHEET-005 — Firearm fields on weapons.** *(rules-driven. The official sheet's Signature
Weapons block is only `WEAPON | DMG | SHOTS | RANGE` — these fields exist to make the firearms
compendium and the combat rules work, not to reproduce a printed column.)*

The WF firearm row is `CAL | TYPE | AMMO | DAMAGE | ROF | LOAD | RELOAD TIME | RANGE (s/m/l) |
CON | $ | YEAR` (`Weird_Frontiers_Reference_Guide.md:1441-1443`), defined at `:1360-1372`.

**Stored in `flags.wfvtt.firearm`, NOT on the weapon schema.** The DCC system exposes
`dcc.defineBaseActorSchema` and `dcc.definePlayerSchema` for actors and **has no item
equivalent** — grep-verified, the only `Hooks.callAll` in any data model is those two. A
module-defined Item sub-type was rejected because DCC's attack pipeline keys on
`type === 'weapon'`, so a firearm has to *be* a weapon. Flags are Foundry's documented mechanism
for one package adding data to another's documents. The cost: flags are untyped, so
`normaliseFirearm()` in `module/wf-firearm.mjs` does the coercion a schema would have done, and
every read goes through it. **An upstream `dcc.defineItemSchema` hook would remove the need for
all of this and is worth raising with the DCC maintainers.**

Reused rather than duplicated: `system.range` already holds the `short/medium/long` shape.

**`system.damage` must hold a single valid formula — NOT the banded profile.** Foundry's `Roll`
parses `/` as division: `new Roll('d14/d10/d7').evaluate()` yields the formula
`1d14 / 1d10 / 1d7` and a total of about 1, **with no error** (verified live — it returned 1.2).
A shotgun authored that way would silently roll ~1 point of damage. The short band goes in
`system.damage`; the printed profile goes in `flags.wfvtt.firearm.bandedDamage`, and the sheet
warns if a `/` appears in the damage field.

Two field semantics that are easy to get wrong:
- **`TYPE` means different things in different tables.** For a firearm it is the *action* —
  single / double / lever — and only a single-action gun can be fanned
  (`Reference_Guide.md:1362-1364`). For melee and ranged weapons the same column is the S/B/P
  *damage type*, which selects the crit chart. These are separate fields here.
- **Range bands are flat attack modifiers** — short +1, medium 0, long -1
  (`Weird_Frontiers_V6.md:2902`) — not DCC's damage-affecting range categories.

**Needs clarification — RELOAD TIME notation.** Both books define it as "the number of rounds it
takes to reload a single bullet" (`Weird_Frontiers_V6.md:3082`,
`Reference_Guide.md:1372`), and the Reference Guide adds "1/3 means 1 bullet every 3 rounds".
That gloss cannot be right as written: under it a printed `3` and a printed `1/3` mean the same
thing, yet the table uses both — musket `3`, .44 lever-action `1/3`
(`Reference_Guide.md:1448`, `:1450`). A lever-action repeater reloading no faster than a
muzzleloading musket is not plausible; the natural reading of the fraction is *1/3 of a round per
bullet*, i.e. three bullets a round. **Until this is adjudicated the field stores the printed
string verbatim and is not interpreted** — that cannot be wrong, lets the ~90-gun compendium be
authored now, and confines the fix to one place later.

**Not modelled yet:** a second barrel profile. LeMat-style guns print one in parentheses —
`d8 (d10/d6/d4)`, `ROF 2 (1)` (`Reference_Guide.md:1481`).

**None of it is automated.** ROF ceilings, range modifiers, reload checks and conceal contests
are data for the judge. `rofPenalty()` and `rangeBandModifier()` exist in `wf-firearm.mjs` so the
numbers have one home when the attack wiring is built.

## Requirements — Player sheet

**REQ-SHEET-010 — One WF common part, shared by every WF class.**
Replace `commonParts()` in `module/wf-class-data.mjs` with a WF-authored
`actor-partial-wf-common.html`. Every class registered through `registerWeirdFrontiersClasses`
picks it up; no per-class duplication.

**REQ-SHEET-011 — The Player sheet reproduces the official sheet's field set.**
Authority is the published sheet, `CharacterSheet01A_REV05`, mapped widget by widget in
`docs/official-sheet-field-map.md` (kept outside the repo at
`~/WF-Stuff/CharacterSheet_FF_official_REV05.pdf`).

Page 1: NAME · CLASS · XP · LVL · OCCUPATION · SPEED · LUCKY/BIRTH SIGN · the PATH track ·
six ability scores each with a modifier · REF/FORT/WILL saves beside Agility/Stamina/Personality ·
HP · ARMOR CLASS · **GRIT** · a COMBAT box of INITIATIVE / MELEE BONUS / RANGED BONUS / CRIT DIE /
**FUMBLE DIE** · a large SPECIAL ABILITIES & SPELLS free-text area · and SIGNATURE WEAPONS as five
rows of `WEAPON | DMG | SHOTS | RANGE`.

Page 2: GOODS & SUNDIRES · TRAIL NOTES · **DINERO** (money) · VALUABLES · ARCANE VAULT ·
STABLE (mounts).

**Implementation notes.** SIGNATURE WEAPONS is **derived** from the actor's weapon items, not
stored as twenty free-text widgets. On paper those widgets are the only place the numbers can
live; here all four already exist on the item — the name, DCC's `system.damage` and
`system.range`, and a firearm's `load` (capacity) and `bandedDamage` from
`flags.wfvtt.firearm`. Re-typing them would create a second source of truth for damage that
drifts the moment the item is edited. A weapon is marked with the star in the weapons list,
which writes `flags.wfvtt.signature` through DCC's own `items.<id>.…` form path. Nothing is
truncated to five: the paper form ran out of rows, the data has not, so past five the sheet says
so rather than hiding a row.

The five large free-text widgets are `StringField`s on
`system.details.*` rendered as `<textarea>`, matching how DCC itself treats
`details.languages` and `details.birthAugur` rather than its `details.notes.value` `HTMLField` —
ProseMirror plus an enrichment pass buys nothing for five boxes whose paper originals are ruled
lines. They are **Player-only**: a monster stat block has none of them.

GOODS & SUNDIRES (`untitled33`) is deliberately the one page-2 widget with no free-text field.
It is the only one that has an item equivalent, and the Goods list *is* it; a free-text twin
would give inventory two sources of truth. Same reasoning as Dinero being editable in exactly
one place.

Note what the official sheet does *not* carry: no Boons/Hexes counters, no derangement or
contraption boxes, no per-firearm Conceal/ROF/Load/Reload columns, no armor block, no portrait
field, and no background/personality back page. Fields we add beyond this list (REQ-SHEET-002
Grit aside, which *is* on the sheet) are justified by the rules, not by the sheet, and should be
labelled as such.

**REQ-SHEET-012 — AC is level-scaled. DONE.**
`10 + Agility mod`, **plus a cumulative +1 per character level** (`Weird_Frontiers_V6.md:2852`).
DCC has no level term.

Neither of the two options sketched here was taken. `config.computeAC = false` would have meant
reimplementing DCC's whole AC formula (armor, speed penalty, base-ability choice) to add one
term, and an effect on `ac.value` does **nothing** — DCC writes that field in
`prepareDerivedData`, which runs *after* effects, so it is simply overwritten. Verified live.

Instead the bonus is a managed Active Effect on **`system.attributes.ac.otherMod`**, `type: 'add'`,
value = level. DCC *reads* that field when it computes
`ac.value = 10 + abilityMod + armorBonus + acOtherMod` (`reference/dcc/module/actor.js:243`), and
effects have already run by then — so the bonus flows through DCC's own formula and **stacks
with** whatever the player typed into their own modifier field, which the rule requires ("further
modified by spells, lucky rolls, miracles, contraptions…").

Applied only to actors whose `sheetClass` is a WF class and whose level is ≥ 1, so 0-level funnel
characters and plain DCC characters in the same world gain nothing. Verified live at levels 0/1/3/5
— including the book's own worked example, a 3rd-level character at AC 14.

**REQ-SHEET-013 — The fumble die must become correct. DONE.**
Solved with an Active Effect, and no monkey-patching was needed. Foundry prepares a document
`prepareBaseData` -> `applyActiveEffects` -> `prepareDerivedData`; DCC's armor derivation is in
`prepareBaseData`, so an effect applies after it and wins. DCC also lists this exact key in its
own Active Effect autocomplete (`reference/dcc/module/active-effect-key-autocomplete.mjs:23`),
so it is a sanctioned target. `module/wf-fumble.mjs` maintains one effect per actor and re-syncs
it when class or level changes; the die values are generated into `module/wf-fumble-data.mjs`
from the same chart the ratchet verifies, so there is no second copy to drift.

*Originally recorded as blocked:* DCC recomputes `attributes.fumble.die` from equipped armor on every
`prepareData`, unconditionally (`reference/dcc/module/actor.js:76-99`), and WF has no armor, so it
always reads `1d4`. Confirmed live on the smoke server — the value survives neither level data nor
an explicit write. WF's die is per class and level (`Weird_Frontiers_V6.md:2884`; gunslinger d12→d3
at `:1405-1417`). Until this is fixed the sheet carries a warning note, which is a stopgap, not the
requirement being met.

**REQ-SHEET-013a — 0-level characters need their own fumble and crit dice. DONE.**
`Weird_Frontiers_V6.md:616`: zero-level characters use a **d14** fumble die and a **d6** crit die.

*The blocker was identification, not mechanism* — a 0-level character has no class, so it has no
WF `sheetClass`, and DCC's own zero-level sheet stamps every one of them `Generic`
(`reference/dcc/module/actor-sheets-dcc.js:206-209`). A WF funnel character and a plain DCC one
were indistinguishable, and applying `1d14` to every level-0 actor would have corrupted plain DCC
characters in any world where this module is merely enabled.

**Resolved by asking the question the module already answers thirteen times over:** a character is
a WF character because a WF sheet was chosen for it. "Frontier Folk" is registered as a
fourteenth, class-less entry (`module/wf-zero-level.mjs`) — `registerClassDefaults` +
`registerSheetPart` under classId `frontier-folk`, and a sheet registered as `wfvtt-frontier-folk`.
Picking it writes `sheetClass = 'Frontier-Folk'`, and everything downstream keys off that **per
actor**, so a world running WF and DCC characters side by side still works.

A world-level `dcc.activeVariant` check was considered and rejected: less code, but world-wide, so
it cannot express a mixed world — and it would mean designing around `registerVariant`, which
§5a records as having zero production consumers.

**The two dice are implemented differently, deliberately.** The fumble die is an Active Effect
because DCC recomputes `attributes.fumble.die` from equipped armor on every `prepareBaseData`
(`actor.js:76-99`) and WF has no armor, so a stored value is discarded. The crit die is a plain
stored class default because DCC never recomputes `attributes.critical.die` at all. Not taken on
the grep alone — verified live: a stored `1d6` crit die survived a bare `prepareData()` and a real
update, while a stored `1d14` fumble die reverted to `1d4` immediately.

The 0-level fumble die is gated on **level 0 specifically**, not merely on the sheet, so a
character left on that sheet after gaining a level gets no managed die rather than a wrong one.

WF is silent on the 0-level crit RANGE; that falls back to DCC core's 20
(`actor-sheets-dcc.js:210`), and is labelled as a DCC fallback in the code.

No progression pack is registered for it — 0-level characters have no progression; they gain one
by becoming a class. Occupations and starting wealth (1d4 dollars, `Weird_Frontiers_V6.md:614`)
remain future funnel work.

*"All funnel characters begin 'walking the line'" (`:618`, and `:596` "All characters beginning
zero-level play are Walking the Line (WtL) on the path tracker") is already satisfied:* the Path
defaults to position 0, the Line, for every actor — see REQ-SHEET-001.

**REQ-SHEET-015 — Crit and fumble tables by damage type. DATA DONE; WIRING PENDING.**
WF keys critical hits to the DAMAGE TYPE of the weapon — Blunt, Piercing, Slashing, Firearms,
Wrestling — and fumbles to the attack mode — Melee, Ranged, Firearms
(`Weird_Frontiers_V6.md:2866`, `:2886`). Eight tables in all.

> ### This requirement was never actually blocked. Corrected 2026-09-23.
>
> This entry used to read "BLOCKED ON SOURCE MATERIAL … `Weird_Frontiers_V6.md` does not contain
> these charts at all — only a contents reference to pages 865-880. No WF rulebook PDF is on
> disk." **The first claim was false and nobody had checked it.** V6's appendix carries all eight
> charts in full at `:16215-16291`. One `grep -n "CRITICAL HIT CHART"` would have found them.
>
> The measurement that produced the block was real and correct — 69 of 100 Reference Guide rows
> truncated — but it was taken over the **Reference Guide only**, and the conclusion drawn was
> about the whole corpus. A second, better pdf2md conversion of the rulebook was commissioned to
> fix it; that conversion is **byte-identical to the existing corpus for all 16 chart bodies**.
> The cost was a requirement parked indefinitely and a request for source material already on
> disk.

**The data is extracted and cross-validated.** `tools/build_crit_tables.py` produces
`data/crit_fumble_tables.json` — 8 charts, 225 rows, of which 224 are complete — and is ratcheted
in `npm run verify`.

*It uses both printings, for different things, which is only possible because the book prints the
charts twice:*

- **V6's appendix** has the complete row text, but its layout is a trap — pdf2md emitted each
  chart's **body BEFORE its heading** (caption-below-figure). A parser assuming heading-then-body
  shifts every chart by one and serves gunshot criticals from a club.
- **The Reference Guide** prints real markdown tables with the heading first, so the
  chart-to-name mapping is unambiguous — but its rows are truncated and gappy.

So names and roll assignment are confirmed against the Reference Guide while the text comes from
V6, and **every one of the 100 rows present in both printings agrees**. That is what proves the
bodies are paired with the right headings.

**One row is genuinely unrecoverable:** `CRITICAL HIT:WRESTLING` roll 17 is cut mid-sentence at a
page break in V6 ("…inflicts +2d12 damage and the") and is one of the 19 rolls missing from the
Reference Guide's Wrestling chart. It needs the PDF or a judge's ruling. The generator asserts
that exactly one such row exists, so a second one cannot appear unnoticed.

**The packs are built and registered.** `packs/wf-crit-tables` ships eight RollTables, generated
from that JSON by `tools/build_crit_table_items.mjs` and announced on `dcc.ready`. Verified live:
DCC's own resolver returns WF text for all five damage types, the open-ended top and bottom rows
match rolls of 47 and -3, and DCC's `Crit Table III` still resolves — no prefix collision either
way.

*The RollTable result schema was read off a live v14 system rather than guessed:* `type` is the
string `'text'` and the text lives in `description`, not `text`. Same class of v13+ rename as the
ActiveEffect `mode` -> `type` change.

*Embedded documents are separate LevelDB entries* keyed `!tables.results!<tableId>.<resultId>`.
Omitting that key fails the whole compile with a bare "Key cannot be null or undefined" naming
neither the file nor the document.

**The wiring is ready and is not blocked.** DCC resolves a crit table by name prefix,
`'Crit Table ' + suffix`, where the suffix is `weapon.system.config.critTableOverride` falling
back to the actor's `attributes.critical.table` (`reference/dcc/module/item.js:270`,
`utilities.js:294`). So naming the tables `Crit Table Blunt`, `Crit Table Firearms` and so on,
and setting each weapon's `critTableOverride` from the `damageType` already on it, wires the
whole thing up with no further platform work.

**Two platform limits, both recorded and neither worked around:**

*PC fumbles — one chart at a time.* `CONFIG.DCC.fumbleTable` is a SINGLE global name
(`utilities.js:443`) and the weapon schema has no fumble-table override, so WF's three fumble
tables cannot be selected per attack. A world setting picks which is live, with a fourth option
leaving the system's own table alone for mixed worlds. It `requiresReload`, because choosing that
option cannot un-set a value already written.

***NPC fumbles are not automated at all.*** An NPC fumble never consults
`CONFIG.DCC.fumbleTable`. DCC derives the name from the creature's CRIT table
(`getFumbleTableNameFromCritTableName`, `utilities.js:467`), returning `Fumble Table <critTable>`
— so a WF creature, whose crit table is Blunt / Piercing / Slashing per REQ-SHEET-022, sends DCC
looking for "Fumble Table Blunt". `getNPCFumbleTableResult` (`utilities.js:487`) then searches
exactly two places: the hardcoded `dcc-core-book.dcc-monster-fumble-tables` pack and the world's
own tables. **A module compendium is never consulted**, so no name this module could choose would
be found. Creature fumbles are rolled by hand from the compendium. Lifting it needs an upstream
change — have the NPC path search the registered crit-hit packs as the PC path already does — or
a GM-invoked importer copying the charts into world tables, which mutates the world and so is not
something this module should do unasked. *(Found in review, against a claim here that the
setting covered every actor.)* `dcc.rollWeaponAttack` is listed as a stable hook but is
not emitted anywhere in 0.70.50, so it cannot be used to swap the global just in time. The
realistic options are a world setting choosing which of the three is active, or an upstream
request for a per-weapon override.

**REQ-SHEET-014 — No armor block. DONE.**
WF has no MUNDANE armor: no armor table, no price list, nothing to buy or equip. Cover replaces it
— Partial +1 / Half +2 / Full +4 (`Weird_Frontiers_V6.md:2974-2978`), adjudicated per situation by
the judge and therefore not a sheet field. The AC rule states the *unarmored* case as the general
one, with no armored alternative anywhere (`:2852`).

The armor section is dropped from `templates/actor-partial-wf-equipment.html`, a generated fork of
DCC's equipment tab, and the equipment sub-tab is relabelled from `DCC.WeaponsAndArmor` to
"Weapons" via a `TABS` getter on the WF sheet mixin — otherwise the sheet advertises a section
that is not there. Ammunition is kept: WF firearms use it.

The `armor` item TYPE stays registered, and DCC's AC computation still sums equipped armor
(`reference/dcc/module/actor.js:226-243`) — with no way to add armor from this sheet it sums
nothing. Standing rule: stop *showing* a DCC field, never remove it.

*The word "armor" does appear in both books; none of it is an inventory item.* Magical and
contraption armor — Golemite Armor (`:5065`), the Armor of Darkness spell (`:7784`) — grants a
**temporary** AC bonus for a duration, which is an Active Effect, not an item with a static
`acBonus`. Three melee weapons grant "+1d versus armored opponents" (Katar, Mace, Pick —
`Weird_Frontiers_Reference_Guide.md:1394`, `:1398`, `:1402`), which is about NPCs being armored.
Monsters carry natural armor in their stat blocks (chitin, `:13637`). Checked because the
requirement rests on a *negative* canon claim, which is the kind no local test can ever fail on.

## Requirements — NPC sheet

**REQ-SHEET-020 — WF NPC sheet subclassing the DCC one. DONE.**
Register with `registerActorSheet('NPC', …, { scope: 'wfvtt-npc' })`. **Do not pass
`makeDefault: true`** — this module can be installed in a world that also runs plain DCC, and
`makeDefault` unregisters the core sheet for the whole subtype
(`reference/dcc/module/extension-api.mjs:104-107`).

**REQ-SHEET-021 — Stat block field order matches the book. DONE.**
Implemented as a compact select of the book's Path codes, because an NPC sheet is a stat block
rather than a character record.

**Monsters store `system.details.path.code`, not the player's signed `position`** — a bare `POD`
is a real, common state (24 stat blocks) and is not the same as Walking the Line (59), and the
signed track has no slot for it. See the resolved entry under "Needs clarification".
`Init · Atk · AC · HD · [hp] · MV · Act · [SP] · SV Fort/Ref/Will · Path`
(`Weird_Frontiers_V6.md:11429`). Identical to DCC's except `AL` becomes `Path`
(`docs/wf-mechanics-delta.md` §9). No Grit, no Fear DC, no ROF on the NPC sheet.

**REQ-SHEET-022 — Crit die/table are derived for monsters, not stored. DONE.**
Die from HD (`Weird_Frontiers_V6.md:11398-11421`), table by attack type (`:11392`).

The 22-row chart is GENERATED into `module/wf-monster-crit-data.mjs` by
`tools/build_monster_crits.py` and re-derived by `npm run verify`, so there is no second copy to
drift. It is one of the few wide tables in this corpus that survived the pdf2md pass intact — all
22 rows parse. The book prints "D4/D14"; these are stored as Foundry formulas (`1d4`, `1d14`).

*The two dice run opposite ways* — a tougher creature crits harder (d4 → d30) and fumbles less
badly (d14 → d3). A "bigger is better" assumption gets one of them backwards.

The crit TABLE is named by attack type rather than DCC's roman numeral, on the same
`system.attributes.critical.table` field so nothing is added to the schema. **It stays FREE TEXT,
with Blunt / Piercing / Slashing offered as suggestions.** A closed dropdown was written first and
that was wrong: the same passage also allows "the specialized Critical Hit charts
included in these books for some of the more legendary creatures (dragons, giants, un-dead, etc.)"
(`:11390`) and says judges "are also encouraged to create their own unique tables" (`:11392`) — and
a select would blank out an NPC converted from plain DCC, whose table is a numeral like `M`.

The tables those name are REQ-SHEET-015 and still blocked; recording *which* table applies is
knowable now.

**The chart's "Less than 1" row is unreachable through the sheet.** DCC cleans any value that is
not valid dice notation to `1d4` (`reference/dcc/module/data/actor/base-actor.mjs:34-38`) —
verified live: `lots`, `0`, `½` and `1/2` are all stored as `1d4`, i.e. 1 HD. The row is
implemented anyway, for a value arriving via the NPC parser or another module.

**REQ-SHEET-023 — Fear DC is computed at render, never stored. DONE.**
`8 + creature HD + the *character's* Hex tokens` (`Weird_Frontiers_V6.md:3229`). It depends on who
is looking at the monster, so it cannot be a field on the monster.

The sheet shows `8 + HD` and labels the remainder "+ Hexes" rather than printing a total it cannot
know. *This is not in tension with REQ-SHEET-021's "no Fear DC on the NPC sheet"*: that governs
the stat-block LINE, which the book prints without one. This is a derived judge aid beside the
crit block, and it is not a field.

## Needs clarification

- ~~**Sheet scope.**~~ **RESOLVED 2026-09-12** — the published sheet is a single sheet used by
  every class, with no class-specific boxes anywhere on it. One WF common part for all WF
  classes (REQ-SHEET-010).
- **Variant gating.** Should the WF sheets be offered in every world this module is installed in,
  or only when `dcc.activeVariant` is `wf`? The variant layer has no production consumers upstream
  (`docs/dcc-platform-brief.md` §2), so gating on it is unproven. Assumed: offered always, chosen
  per-actor by the GM, until the variant layer is validated live.
- ~~**Class-specific fields on a shared sheet.**~~ **RESOLVED 2026-09-12, and an earlier reading
  here was wrong.** The claim that the official sheet is per-class came from
  `~/WF-Stuff/Obadiah Dunmore.pdf`, which is a *custom* fillable carrying bedlamite-only boxes —
  not the published sheet. The published sheet is class-agnostic and puts class abilities in the
  free-text SPECIAL ABILITIES & SPELLS area. Decision stands, for a better reason: shared common
  part, plus a per-class tab for anything mechanical that wants wiring (as the gunslinger's
  Deadeye die already does).

- ~~**A monster's Path can be a bare code with NO modifier.**~~ **RESOLVED 2026-09-22 by the
  review, which was right.** The bestiary prints the Path as a code with
  an OPTIONAL modifier, and a bare code is a different state from Walking the Line. Counted
  case-insensitively (the book writes both `POD` and `PoD`): **`WTL` 59, bare `POD` 24**,
  `POD +2` 11, `POD +1` 9, `POD +3` 7, `POR +3` 7, `POR +1` 3, `POD +1d` 1.

  The signed `position` has no slot for "Damned, no modifier" — magnitude 0 already means the
  line — so storing monsters on it would have silently converted 24 Damned creatures into
  line-walkers. Fixed with `system.details.path.code`, a string holding the code exactly as
  printed. **Players use `position`, NPCs use `code`**: the book itself prints a nine-notch track
  on the character sheet and a code in the stat block, and neither representation can express the
  other.

  *An earlier count here said "bare POD 13, WTL 1" and concluded the gap affected 13 of 34 stat
  blocks. That survey grepped case-sensitively for `[A-Z]{3}` and missed most of the bestiary.*

- **Dice and modifiers as selects.** On the paper sheet the ability modifiers, the three saves,
  and all five COMBAT values are ComboBoxes, as is each weapon's DMG — the sheet treats them as
  pick-from-a-list. Should the VTT sheet offer the dice chain as a select rather than a text
  input? Assumed: yes for dice, no for computed modifiers (which should be derived, not picked).
