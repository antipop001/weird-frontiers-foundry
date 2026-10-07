# 02 — The Gun Deck

Status: **specified, not implemented.** Raised 2026-09-23.

| Requirement | State |
|---|---|
| REQ-DECK-001 A 54-card deck per character | **done** — three scopes: per character (default), per player (funnel setting), one judge deck for all NPCs |
| REQ-DECK-002 Ship our own deck — Foundry's has no jokers | **done** — `wfvtt.wf-gun-deck`, 54 cards, jokers distinguished in flags; art generated locally |
| REQ-DECK-003 Flip one card per shot discharged | **done** — `api.gunDeck.flip(actor, count)`, one card per shot, reshuffles when exhausted |
| REQ-DECK-004 The card result table | **done** — `classify(card)`; tokens awarded, modifiers and the fumble reported not applied |
| REQ-DECK-005 Reshuffling | **done** — all four triggers; the Boon spend is policed, downtime is not |
| REQ-DECK-006 Natural 1 after a safe draw is not a misfire | **done** — `naturalOneAfterSafeDraw(actor)` awards the Hex |
| REQ-DECK-007 Critical success drawn with an Ace or Eight | **done** — satisfied by construction; the module never rolls a fumble and Hexes are awarded at flip time |
| REQ-DECK-008 Multi-shot penalties: ROF vs fanning the hammer | **done, AMENDED by REQ-COMBAT-002** — `flip(…, {mode, perDie})`; reported per shot, never applied. The original shipped version applied the cumulative −1 across the whole volley; the rule resets it per action die, so `perDie` was added and the arithmetic moved to `shotModifier` in `wf-firearm.mjs` |
| REQ-DECK-009 Gunsmithing removes misfire cards from the deck | **done** — `gunsmith(actor, total)` deletes `floor(total/5)` aces/eights; `restock()` restores |
| REQ-DECK-010 Ghost-irons: Luck cancels a misfire (Gunslinger only) | **done** — `flip(…, {ghostIron: true})`; misfire stands, fumble not rolled |
| REQ-DECK-011 Draw-two-take-worse effects | **done** — `flip(…, {drawTwo: true})`; both cards leave the deck |

The Gun deck "is at the heart of the firearms system" (`Weird_Frontiers_V6.md:3108`) and has **no
DCC analogue whatsoever**. It is the last of the seven subsystems in `docs/wf-mechanics-delta.md`
§5b, and the one that consumes most of what is already built: Boon and Hex tokens
(REQ-SHEET-003), the Firearm Fumble chart (REQ-SHEET-015), the fumble die (REQ-SHEET-013) and the
firearm field set (REQ-SHEET-005).

**Explicitly out of scope:** the Gambler's *dead man's hand* class ability (`V6:1287`), which also
flips cards but from its own freshly shuffled deck and resolves against its own Dead Man's Hand
chart. It shares vocabulary with the Gun deck and must not be conflated with it.

---

## Background — the platform

*Verified live against Foundry 14.368 on 2026-09-23, not read from documentation.*

- Foundry has a first-class **`Cards`** document (`type: 'deck' | 'hand' | 'pile'`) with an
  embedded `cards` collection. Methods: `draw`, `deal`, `pass`, `shuffle`, `recall`,
  `sortShuffled`, `sortStandard`, plus `…Dialog` variants. Getters: `availableCards`,
  `drawnCards`. This is the right primitive; nothing needs inventing.
- A `Card` carries `suit`, `value`, `face`, `faces[]`, `drawn`, `origin`, `name`, `description`
  and `flags`.
- **Foundry's built-in deck presets are `pokerDark` and `pokerLight`, and both hold 52 cards with
  NO JOKERS** — verified by fetching `/cards/poker-deck-dark.json`: 4 suits × values 1-13, zero
  joker entries. WF requires jokers, and they are the two most dramatic results in the system, so
  the presets are unusable as-is. See REQ-DECK-002.
- Joker artwork nevertheless ships with Foundry: `cards/dark-gold/joker.webp` exists (HTTP 200)
  even though no preset references it. Card backs are at `cards/backs/dark-gold.webp`.
- `Cards` documents can live in a compendium pack (`"type": "Cards"` in `module.json`).

---

## Requirements

**REQ-DECK-001 — One 54-card deck per character.**
"Each player with a character that carries a firearm should have a standard deck of playing cards
(jokers included) close at hand during play" (`Weird_Frontiers_V6.md:3108`).

Scope is explicitly one deck per *character*, not per firearm: "We recommend that one deck be used
for all the character's firearms. In the case of a funnel session where players control multiple
characters, consider using one deck per player for all characters" (`:3116`). And for NPCs,
"Judges should use one Gun deck during encounters where one or more enemies use firearms"
(`:3124`) — one deck for *all* enemies, not one per enemy.

So: a per-actor deck, created on demand, plus a single shared judge deck for NPCs.

**DONE.** `scopeFor(actor)` in `module/wf-gun-deck.mjs` resolves one of three scopes:

| Scope | Key | Who |
|---|---|---|
| Character *(default)* | `actor:<id>` | one deck for all of that character's firearms (`:3116`) |
| Player *(world setting)* | `player:<userId>` | funnel mode, one deck across a player's characters (`:3116`) |
| Judge | `judge` | **every NPC, always** — one deck for all enemies (`:3124`) |

*Only the funnel case is a setting*, because the book says "**consider** using one deck per
player" while the judge rule is unconditional. An NPC also has no player to own a deck.

**A bug this fixed:** the first get-or-create keyed every actor on `actor.id`, which gave each
NPC its own deck — the opposite of `:3124`, and a Cards sidebar full of decks after one gunfight.

*Ownership* is mirrored from the actor for character scope, so whoever can play the character can
see and draw their own cards; created GM-only a player could not open their own deck. Player scope
grants OWNER to that user; the judge deck stays GM-only.

*Lifecycle:* all Gun decks live in one folder. Deleting a character deletes its deck — character
scope only, since a player deck outlives any one funnel casualty and the judge deck outlives
everything. Deck creation is **serialised per scope**: two flips arriving together would otherwise
both find no deck and both create one, and duplicate decks then drift apart card by card. Same
race that produced duplicate Active Effects earlier in this project.

**Players cannot create the deck themselves**, and this is a platform constraint rather than a
choice: `CARDS_CREATE` is granted to roles 3 and 4 only (Assistant GM, GM) and folder creation is
GM-only, so a player whose character fires the first shot of the session would hit a permission
error. Creation is delegated through **DCC's own GM surface**, `game.dcc.socket.executeAsGM` with
a handler registered on `dcc.ready` — it already picks the single active GM, warns when none is
connected, and runs locally for a GM caller.

> *A bespoke `game.socket.emit('module.wfvtt', …)` was tried first and the message never arrived,
> with the listener attached and both clients connected.* `game.socket` has to be wired at
> **ready**; the system's own module says so outright ("game.socket is available at ready",
> `reference/dcc/module/socket.mjs`). Registering it in `init` attaches a listener that never
> fires.

*Still not built:* renaming a character leaves its deck's name stale.

**REQ-DECK-002 — Ship our own deck; Foundry's presets cannot be used. DONE.**
Both built-in presets are 52 cards with no jokers (see Background). The module ships a 54-card
deck as the `wfvtt.wf-gun-deck` compendium: the standard 52 plus a **red** Joker and a **black**
Joker, which have different effects and are therefore distinguishable in data, not by name.

`tools/build_gun_deck.mjs` generates the pack source and is ratcheted in `npm run verify`, which
also asserts every face image exists on disk — a missing file would otherwise show up as a broken
card in the pile rather than as a build error.

**Encoding.** Values follow the built-in poker deck (ace 1 … king 13) so anything that already
understands a Foundry deck keeps working; the jokers take the free values 14 and 15, sit in a
`joker` suit so they drop out of any suit filter, and each carries `flags.wfvtt.joker` of `red` or
`black`. *The colour is in data, never in the name* — red and black do opposite things, and a
localized card name would break that in any non-English game. Same class of mistake as dispatching
on `system.class.className`, which this project already forbids.

**Art** is generated locally (ComfyUI), not taken from any published deck: 12 court figures, 2
jokers and a back emblem, with the 40 pip faces composited so ranks and pip counts are exact.
Suits are themed on WF's factions — Spades the Damned, Hearts the Righteous, Diamonds the
gamblers, Clubs the frontier folk — and all four Jacks plus the Spades court carry skull faces.
The jokers are the rulebook's own Lady Luck and Lady Calamity.

*Verified live:* 54 cards, 13 per suit plus 2 jokers, all 55 art URLs resolving, and the joker
colour surviving a shuffle and a copy into the world.

**REQ-DECK-003 — One card per shot discharged. DONE.**
"Players flip a card each time their character discharges a firearm" (`:3112`). *Each* shot, not
each attack action: "Remember that a card from the gun deck must be flipped for each shot fired,
including each shot from fanning the hammer" (`:3138`), and again for shots within ROF —
"Remember that EACH shot requires a flip from the gun deck" (`:3076`).

**REQ-DECK-004 — The card result table. DONE.** (`:3112`, verbatim):

| Card | Result |
|---|---|
| 2, 3, 4, 5, 6, 7, 9, 10 | "has no effect, the player should roll normally for a ranged attack" |
| Jack (either colour) | "+1" to attack **and** damage, one-time |
| Queen | "+2" to attack and damage, one-time |
| King | "+3" to attack and damage, one-time |
| **Ace or Eight** — a dead man's hand | "spell disaster … and result in a misfire. The shot misses and the attacker must immediately roll on the Firearm Fumble chart with the appropriate fumble die modified by the reverse of any Luck modifier" |
| **Red Joker** | "an automatic critical hit … and the character receives 1d3 Boon tokens" |
| **Black Joker** | "an automatic misfire … and the character receives 1d3 Hex tokens" |

Note the face-card bonus applies to attack *and* damage, and the misfire's fumble die is modified
by the **reverse** of Luck — the same inversion the fumble die already uses, because lower is
better on a fumble chart.

The Firearm Fumble chart is `Fumble Table Firearms` in `wfvtt.wf-crit-tables`, shipped under
REQ-SHEET-015. **Note the platform limit recorded there:** an NPC fumble never consults a module
compendium, so the judge's deck will need the chart rolled by hand.

**Implemented in `module/wf-gun-deck.mjs`.** `flip(actor, count)` draws one card per shot,
classifies each, awards tokens and posts a chat card; `classify(card)` is the table above.

*What is automated and what is not, deliberately:*

- **Automated** — the draw, the classification, the reshuffle when the last card is flipped, and
  the Boon/Hex awards. "The character receives 1d3 Boon tokens" is a die roll and an integer, not
  a judgement, so it is rolled and written to the REQ-SHEET-003 counters.
- **NOT automated — the fumble roll**, though the module knows both the die (REQ-SHEET-013) and
  the Luck modifier. It cannot see the attack roll, and REQ-DECK-007 makes the fumble conditional
  on it: a critical success drawn with an Ace or Eight still misfires but does not roll. Rolling
  automatically would be wrong in exactly the case the judge most needs it right. The card reports
  the formula and states the exception.
- **NOT automated — the attack and damage bonuses**, which are reported. The flip sits beside an
  attack this module does not own, and `dcc.rollWeaponAttack` is documented as stable but is not
  emitted anywhere in 0.70.50.

> **A black Joker DOES roll the fumble chart, and the proof is indirect.** Its entry says only
> "an automatic misfire … and the character receives 1d3 Hex tokens"; "misfire" is *defined* over
> in the Ace/Eight entry as including the chart roll. The clincher:
> `:3132` cancels the fumble on a critical success "but **any stated Hex tokens are still earned**
> as well" — and aces and eights grant no Hex tokens, so the only bad card that rule can be
> talking about is the black Joker. A rule that explicitly cancels the fumble for a card with
> Hexes presupposes that card normally rolls one.

The joker colour is read from `flags.wfvtt.joker`, never the card name (REQ-DECK-002), and **8 is
a misfire while 9 and 10 are inert** — the inert run is "2,3,4,5,6,7,9, or 10", and writing it as
2-10 would silently delete a failure mode. Both have explicit tests.

**REQ-DECK-005 — Reshuffling, four triggers:**
0. "Each player should shuffle the cards before the session begins" (`:3112`) — the session-start
   shuffle. Narrative rather than mechanical, but it is the deck's initial state and a new deck
   must arrive shuffled, not in suit order.
1. "you only shuffle the Gun deck once the last card has been flipped" (`:3120`) — the default;
2. a character may declare they are "cleaning my gun(s)" during downtime (`:3120`);
3. "You can also spend a Boon to reshuffle the Gun deck at any point during play" (`:3120`) — corroborated
   in the Boon list, "Spend a Boon at any time to allow an instant reshuffle of the character's Gun
   deck" (`:64`, `:3203`).

**DONE — all four.** Trigger 0 is the shuffle on deck creation (REQ-DECK-001); trigger 1 lives in
`flip()`, without which the flip stops working after 54 shots; triggers 2 and 3 are
`reshuffle(actor, {reason})`. One `recycle()` sits behind all four — a deck that was recalled but
not shuffled would deal the same sequence again.

**The two on-demand triggers differ in what they cost, and that asymmetry is why they are two
rules and not one:**

- *Cleaning is free but wants downtime.* Downtime is a judgement the table makes, so the module
  does **not** police when it is allowed — a module that refused to reshuffle because it disagreed
  about whether the posse was resting would be worse than useless.
- *Spending a Boon works at any point precisely because it costs one*, so that trigger **is**
  policed: the REQ-SHEET-003 counter is decremented, and a character with no Boons is refused with
  a message rather than quietly reshuffling for free.

An unrecognised reason throws rather than falling through to a silent reshuffle.

*A Cards deck's DRAW order is the `sort` field, not `cards.contents`* — the collection is in
insertion order, so a shuffle check reading `contents` reports the same thing either way. The
tests read `.sort`, and separately assert that a reshuffle changes it.

**REQ-DECK-006 — A natural 1 after a safe draw is NOT a misfire.**
"It would be unfair to declare a ranged attack result of a natural 1 a misfire if the attacker took
a flip from the Gun deck. In this case, count the attack as a miss and the attacker earns a Hex
token for the blunder" (`:3128`). So a firearm attack that drew a safe card and then rolled a
natural 1 is a plain miss **plus one Hex**, and does not roll the fumble chart.

**DONE.** `naturalOneAfterSafeDraw(actor)` awards the Hex and posts the card. It is a helper the
caller invokes when they know the d20 came up 1, and cannot be anything else — the module owns the
deck, not the attack.

**REQ-DECK-007 — A critical success drawn alongside an Ace or Eight.**
"the misfire still happens, but the Fumble chart roll does not (do not roll for a fumble). Any
stated Hex tokens are still earned as well" (`:3132`). The card beats the die: the crit is lost,
the misfire stands, and no fumble is rolled.

**DONE — satisfied by construction, with no code.** Two independent facts make it hold: the module
**never rolls the fumble at all** (REQ-DECK-004, because it cannot see the attack roll), so "do not
roll for a fumble" has no path that could violate it; and the black Joker's Hexes are awarded at
**flip** time, before any attack roll exists, so cancelling a fumble later cannot retract them.
The flip card states the exception in words so a judge holding a crit and an Ace knows not to roll.

*No `cancelFumble()` API was added:* -006 has something to **do**, -007 has only something to
**not do**, and an API that does nothing would be worse than none. Both halves are covered by
tests rather than left to assertion.

**REQ-DECK-008 — Two different multi-shot penalties, and they are not the same.**
This is the easiest thing here to get wrong, because both are "a cumulative penalty per shot":

- **Multiple shots within ROF** — cumulative **-1 flat** per shot after the first (`:3076`).
- **Fanning the hammer** — cumulative **-1d**, a die-chain step, per shot after the first
  (`:3138`). Fanning may exceed the gun's ROF, requires a single-action pistol and a free hand, and
  "a critical success may only be achieved on a d20 or higher-sized die".
- **A Gunslinger fanning** takes **-1 flat** rather than -1d
  (`Weird_Frontiers_Reference_Guide.md:1717`; V6 says only that they "do not suffer the full -1d",
  `:3138`, and the summary table at `:78` lists both figures side by side).

**DONE.** `flip(actor, count, { mode })` takes `rof` (default) or `fanning` and reports the
penalty on each shot — *reported, never applied*, since the attack roll belongs to the system.
The fanning card also carries the conditions from `:3138`: a single-action pistol and a free hand,
it may exceed ROF, and a critical success needs a d20 or larger die.

**REQ-DECK-009 — Gunsmithing physically removes misfire cards from the deck.**
"have the player make a *gunsmithy* skill check with a standard DC 5. For every multiple of 5 the
check is passed by, have the player remove one Ace or Eight from their gun deck before reshuffling
their deck for the start of the day" (`:2984`, repeated at `RG:1713`). A natural 20 removes four.

So deck *composition* is mutable, and a thinned deck must persist across a reshuffle for the day.
This rule is nowhere near the Gun Deck chapter and is easy to miss.

**DONE.** `gunsmith(actor, checkTotal)` recalls the deck (so cards in the discard pile are
eligible too), removes up to `floor(total / 5)` aces and eights, then shuffles.

*The arithmetic is pinned by the worked example, not by parsing "passed by":* **5 removes 1** and
**20 pulls 4**, which is `floor(total/5)` — and that agrees with `1 + floor((total-5)/5)` at every
value, so the two readings of the sentence never diverge. Below DC 5 nothing is removed.

*The removal is genuinely destructive, and has to be.* Moving the cards to another pile would not
work: `recall()` pulls home every card whose origin is that deck, so they would return on the next
reshuffle. `restock(actor)` re-adds whatever is missing from the compendium for the next day,
re-derived rather than remembered. The deck holds exactly 8 misfire cards, so even a perfect check
removes half and cannot exhaust the supply.

*Not modelled:* the Boon for rolling a natural 20 — that is the general Boon rule (`:3199`), not a
gunsmithing one, and this module does not watch skill checks.

**REQ-DECK-010 — Ghost-irons only: Luck cancels a misfire. NOT a general deck rule.**
"A Luck point may still be spent to ignore the misfire result as usual. A Gun deck draw that
results in a Critical Fumble table roll is ignored and treated as a misfire result instead"
(`:1387`).

**Scoped to the Gunslinger's ghost-irons**, and that scoping was a correction. An earlier draft of
this spec read the words "as usual" as evidence of an existing general rule and promoted this to
one. That was wrong:

- `:1387` sits inside `# • GUNSLINGER •` (heading at `:1373`), in the ghost-iron entry — the
  weapon *is* the physical body of a spirit, which is why misfires get special treatment at all;
- the phrase "as usual" occurs **exactly once in the whole book**, here, so there is no general
  rule for it to refer back to;
- and where the book *does* address Luck against a misfire elsewhere it says the opposite: "The
  misfire result can not be avoided by spending Luck only the corruption" (`:3680`, on miscasts).

*The "as usual" wording is still unexplained* — it reads like a back-reference to a rule the book
never states. Recorded under "Needs clarification" rather than resolved by assumption.

**DONE.** `flip(actor, count, { ghostIron: true })`. A misfire keeps `misfire: true`, loses
`rollFumble`, and gains `ghostIron` and `luckCancellable`; the chat card names the jam, says the
fumble is not rolled, and **suppresses the fumble formula** so nobody rolls it out of habit. The
Hexes a black Joker brings are untouched — they were never part of the fumble roll. Safe and face
cards pass through unchanged.

*The Luck clause is reported, never enforced:* the module does not spend Luck, it says the option
exists. **Ghost-irons are not themselves modelled** — that is Gunslinger class-ability work outside
this spec — so the caller declares the weapon is one.

**REQ-DECK-011 — Some effects draw two cards and take the worse.**
A contraption side effect — "when shooting, flip two cards from the Gun deck and take the worse of
the two results" (`:5569`) — and a spell misfire — "all firearms discharged in the area flip two
cards from a Gun deck to determine misfires" (`:7777`). So the draw API must take a count and a
"worst result wins" comparison, rather than assuming one card per shot.

**DONE.** `flip(actor, count, { drawTwo: true })` draws two per shot and keeps the worse. **Both
cards leave the deck** — both are flipped, so only the outcome is discarded, not the card — and
the rejected card is named on the chat card so the table sees what was dodged.

The severity order, worst last, is the table's own: `redJoker`, `faceCard`, `inert`,
`deadMansHand`, `blackJoker`. A black Joker ranks below an Ace or Eight because it misfires *and*
hands out Hexes.

---

## Needs clarification

- **What does "as usual" refer to in `:1387`?** The ghost-iron entry says a Luck point may be spent
  to ignore a misfire "as usual", but the book states no such general rule anywhere, and for
  miscasts it explicitly denies one (`:3680`). Either a general rule was cut in editing, or the
  phrase is loose writing. Treated as Gunslinger-only (REQ-DECK-010) until ruled on.
- **Is the face-card bonus per shot or per attack?** The text says a face card "offer[s] a one-time
  bonus to attack and damage rolls". With fanning the hammer flipping a card per shot, a Jack on
  the second of four shots most naturally applies to that shot only. Assumed: the bonus attaches to
  the shot whose card it was.
- **Does a red/black Joker's automatic critical use a crit chart?** A Joker gives "an automatic
  critical hit"; WF crits are rolled on a damage-type chart (REQ-SHEET-015). Assumed: yes, it is a
  normal critical hit and rolls on `Crit Table Firearms`, since nothing says otherwise.
- **Ordering of Ace/Eight vs Black Joker.** Both are misfires; the Joker additionally grants 1d3
  Hexes. No interaction is possible (one card per flip), so this is only a note that the two
  misfire paths differ in their side effects.
- **How much of this should be automated at all?** The project's standing position is that
  judgement calls stay manual (Boons and Hexes are counters, not hooks, per REQ-SHEET-003). The
  card flip itself is mechanical and worth automating; applying a Jack's +1 to a specific shot's
  attack roll is not obviously so. Assumed for a first slice: automate the flip, the classification
  and the token awards, and *report* the modifiers for the judge to apply.
