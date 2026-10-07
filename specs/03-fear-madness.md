# 03 — Grit, Fear and Madness

Status: **complete.** Raised and finished 2026-09-30.

| Requirement | State |
|---|---|
| REQ-FEAR-001 The Fear and Madness tables ship as data | **done** — `data/fear_madness.json` (30 Fear rows, 4 Madness bands) + the `wf-fear` pack, extracted from the PDF text layer and cross-checked against the Reference Guide printing |
| REQ-FEAR-002 The Grit check | **done** — `api.fear.gritCheck(actor, {hitDice, situational, source})`; `d20 + system.saves.wil.value` vs `8 + HD + Hexes + situational` |
| REQ-FEAR-003 Success and critical success | **done** — a natural 20 adds +1 Grit capped at the **effective** max (starting − permanent loss); the +1d against the source is reported, not applied |
| REQ-FEAR-004 Failure: Grit loss and the Fear lookup | **done** — loses `HD || 1`; index = `(DC − total) − Luck + Hexes`, resolved through the shipped table |
| REQ-FEAR-005 Critical failure | **done** — a natural 1 doubles the loss; the source’s +1d attacks are reported, not applied |
| REQ-FEAR-006 Zero Grit triggers Madness | **done** — `1d100 + (−10 × Luck + 10 × Hexes)` into one of the four bands; the −1d and the choice of affliction are reported |
| REQ-FEAR-007 End-of-adventure recovery and permanent erosion | **done** — `api.fear.endAdventure(actor)`; restores to the effective max and spends the single permanent point only if zero was reached |
| REQ-FEAR-008 Permanent zero retires the character | **done** — reported as `retired`; nothing is deleted or disabled |

Grit itself (the pool, its cap, the permanent-loss field) is REQ-SHEET-002 and already ships, as do
the Boon/Hex counters and their four derived modifiers (REQ-SHEET-003) and the NPC Fear DC derived
from HD (REQ-SHEET-023). **This spec is only the loop that joins them.**

---

## The rules, verbatim

Quoted from the PDF text layer (the rulebook PDF, pp.144-148)
because the corpus markdown splices the middle out of the Fear rows — see
`tools/build_fear_table.py`.

**Making a Grit check** (p.145):

> Make a Grit check by rolling a d20 + Willpower save modifier vs. a standard DC 8 + the number of
> Hit Dice the creature has + any Hex tokens attached to the character making the check. The judge
> may make situational modifiers to the DC as needed.

**Success** (p.145):

> If the Grit check matches or beats the DC, the character is unfazed … the character no longer has
> to make a Grit check against the same source of fear for the rest of the adventure unless it
> presents itself in a new light that would call for it.

**Critical success** (p.145-146):

> Rolling a natural 20 results in a reaffirmation for the character and their faith in getting the
> job done. To reflect this, the character's Grit total improves by +1 but cannot exceed its
> starting score. The character also gains a +1d modifier to attack rolls and spell checks against
> the source of fear for the duration of the encounter.

**Failure** (p.146):

> If the character fails the DC of the Grit check, they succumb to the effects of fear. The
> character immediately loses temporary Grit points equal to the number of Hit Dice the creature
> responsible for the check has or 1 point if a creature did not cause the check and uses the amount
> the check failed by modified by Luck (positive Luck modifiers subtract from the total) and Hex
> tokens (add +1 per token) to consult the Fear chart for additional effects.

**Critical failure** (p.146):

> Should the check result be a natural 1 … The character loses Grit points equal to twice the number
> of Hit Dice the creature has, and the creature gains a +1d bonus to all attack rolls against the
> character for the duration of the encounter.

**Reaching zero / recovering** (p.147):

> Characters reduced to zero temporary Grit suffer a temporary mental breakdown of sorts and must
> immediately roll a d% … and consult the Madness section.
>
> Characters regain Grit up to their original starting total at the end of each adventure, unless the
> character was reduced to a Grit score of zero during the current adventure. If this is the case,
> the character's Grit total is permanently reduced by 1 to simulate the slow erosion of sanity.

**Going insane** (p.147):

> Characters reaching a permanent 0 Grit score have gone insane and are unfit for play.

---

## Decisions and open readings

- **A natural 20 succeeds and a natural 1 fails, regardless of the total — and this is WF's own
  general rule, not an inference from the Grit section.** `Weird_Frontiers_V6.md:528`:

  > If you roll equal to or higher than the DC (or AC), you succeed. Otherwise you fail. A roll of an
  > unmodified 1 is an automatic failure, is a fumble and brings some degree of disaster depending
  > upon the task at hand. **Rolling an unmodified 20 is an automatic critical success!**

  Worth recording how this was settled, because it is a cautionary tale about the review gate. The
  local wording admits **two** readings — one leaning on DCC core's saving-throw rule, and
  **rejected it on the next**, arguing that the Grit section's "matches or beats the DC" governs and
  that a natural 20 falling short is a failure which merely also grants the bonuses. Neither pass
  cited `:528`. The general rule is stated in WF itself, is about d20 rolls generally, and is
  explicit — so it governs, and the local section has no need to repeat it. **A reviewer reasoning
  only from the passage you hand it will miss a governing rule elsewhere in the book.**
- **A creatureless critical failure costs 1 Grit, not 2.** The critical-failure sentence doubles
  "twice the number of Hit Dice the creature has" and does **not** repeat the Failure rule's "or 1
  point if a creature did not cause the check". With no creature there are no Hit Dice to double, so
  the flat 1 stands. An earlier version doubled the fallback to 2; that was inference, and a shipped
  number has to be quotable. It still differs from a plain failure, because a natural 1 produces a
  far larger failure margin and therefore a worse Fear row.
- **A natural 20 earns a Boon and a natural 1 earns a Hex** (`V6:3199`, `:3207`). Both are
  **reported, never awarded** — the standing decision for this module is that Boon and Hex counters
  stay manual, because reversing one is a judgement call about what the roll was for and
  auto-awarding would mean hooking every roll in the system.
- **The Fear index follows V6, not the Reference Guide.** V6 says the index *is* the failure margin
  and says so three times; the RG says "Roll 1d20 modified by". Under the RG
  reading a 1 HD creature can make a character pass out, which breaks the chart's scaling to HD.
- **Madness modifiers follow the Madness section, not "Reaching Zero Grit".** The latter says only
  "a d% modified by the character's Luck x 10%" and omits Hex tokens; the Madness section gives both
  the sign and the Hexes — "-10% for each +1 Luck modifier, or +10% for each -1 Luck Modifier. Hex
  tokens impose a +10% modifier per hex." The fuller statement wins.
- **Nothing is applied that the book leaves to the judge.** The +1d against the source, the source's
  +1d attacks, the −1d from Madness, the per-source immunity and the specific phobia are all
  *reported*, never written onto a character or an actor. Same discipline as the Gun Deck, which
  reports modifiers and never applies them.
- **Permanent Grit loss is NOT applied when zero is reached.** The book applies it at the end of the
  adventure. Reaching zero sets a flag; `endAdventure()` is what spends it. An adventure is "1-4
  sessions … an entire module", so it cannot be inferred from anything Foundry knows.
- **A retired character is reported, never deleted or disabled.** Permanent zero means "unfit for
  play" and the book keeps the NPC in the story.
