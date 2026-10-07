# 04 — Firearm combat modifiers

Status: **complete.** Raised and finished 2026-10-01.

| Requirement | State |
|---|---|
| REQ-COMBAT-001 The ROF ceiling is enforced | **done** — `api.combat.planVolley` reports `legal`/`overBy` against `rofCeiling`; fanning is exempt and is flagged when the gun is not single-action |
| REQ-COMBAT-002 The cumulative −1 resets PER ACTION DIE | **done** — `perDie` on both `planVolley` and `flip`; two dice with 2+2 give 0, −1, 0, −1. **Corrects REQ-DECK-008**, which gave 0, −1, −2, −3 |
| REQ-COMBAT-003 Range-band attack modifier | **done** — `api.combat.rangeBandFor(item, feet)`; all 75 shipped ranges parse, and a second barrel in parentheses is captured separately |
| REQ-COMBAT-004 Cover AC bonuses | **done** — `api.combat.coverBonus`, 0 / +1 / +2 / +4 to the **defender’s AC** |
| REQ-COMBAT-005 Reloading, and the distress check | **done** — `api.combat.reload`; `1/3` reads as 3 rounds per bullet, one DC 10 Agility check per round, a failed round spent and `1d6` ammo dropped |
| REQ-COMBAT-006 The concealment contest | **done** — `api.combat.concealCheck`; Int + conceal vs Int, tie to the higher Luck **score**, a double tie reported as a tie |

Every field these rules need already ships on the firearm (REQ-SHEET-005): `rof`, `load`,
`reloadTime`, `conceal`, and DCC's own `system.range`. `module/wf-firearm.mjs` already exports
`rofCeiling`, `rofPenalty` and `rangeBandModifier`, written for "the attack wiring, which is not
built yet". **This spec is that wiring.**

**Nothing here is applied.** DCC rolls its own attacks (`rollWeaponAttack`), and injecting a modifier
into that roll would mean monkey-patching the system, which this project forbids. So the module
*reports* the modifiers for a shot plan and the judge or player applies them — the same discipline as
the Gun Deck and the Fear loop.

---

## The rules, verbatim

**Rate of fire** (`Weird_Frontiers_V6.md:3076`, PDF p.138):

> The ROF for each firearm listed in the Appendix … gives the mechanical limit for how many bullets
> can be fired in each round by normal trigger use (fanning the hammer can exceed this). Even if a
> character has more action dice available, a gun can never fire more bullets in one round than the
> stated ROF. Each bullet fired on the same action die per round after the first shot has a cumulative
> -1 penalty to the attack roll (first shot at no modifier, second at -1, third at -2, a fourth at -3,
> etc.). Remember that EACH shot requires a flip from the gun deck. If a character has multiple action
> dice in a round, they may choose to fire single shots per action die without the cumulative -1
> penalty or fire multiple shots per action die with the cumulative -1 penalty to each action die, but
> at no time can the total number of bullets fired exceed the RoF listed for the gun in use unless
> fanning the hammer is employed.

**Accuracy** (`Weird_Frontiers_V6.md:2902`):

> Each firearm has three ranges listed on the chart. These stand for the number of feet the gun is
> accurate to: short, medium, and long ranges. To keep it simple, use the following range modifiers:
> ♠ Short: +1 to attack ♠ Medium: No modifier ♠ Long: -1 to attack

**Cover** (`Weird_Frontiers_V6.md:2972`):

> Cover can offer a substantial bonus to those coming under gunfire … decide how much of the
> defender's body is covered and apply the listed AC bonus versus the attack. Objects used for cover
> must obscure the defender from the attacker's line of sight. **Partial (+1 AC)** … 

and the Reference Guide's situational table (`:1343`) lists partial +1, half +2, full +4 to the
defender's AC.

**Reloading** (`Weird_Frontiers_V6.md` RELOADING section, PDF p.139):

> Reload times are listed with each firearm in the Appendix. The reload times reflect the number of
> rounds it takes to reload a single bullet into the firearm. Trying to reload a gun during an actual
> fight or while galloping down the trail is an entirely different story! Characters attempting to
> reload under times of distress must pass a DC 10 Agility check each round to do so reliably. Failing
> the check causes 1d6 rounds of ammo to drop on the ground (for higher shot capacities, roll a die
> that appropriately matches the firearm).

The Reference Guide adds the notation (`:1374`): "the reload time reflects the number of rounds it
takes to reload a single bullet into the firearm. **1/3 means 1 bullet each 3 rounds**". The shipped
data carries `1`, `1/2`, `1/3`, `2`, `3`, `3 rds`, `4` and `6`.

**Concealability** (`Weird_Frontiers_V6.md:2966`):

> Each gun has a concealment modifier. Characters apply this modifier at any point they're attempting
> to conceal a firearm. Make an Intelligence-based contested roll vs. anyone trying to spot the gun.
> In the case of a tie, the winner is the one with the higher Luck score.

The Reference Guide states the arithmetic (`:1372`): "the modifier applied to conceal the weapon for a
contested check—Intelligence check + Conceal Mod. vs. target's check result".

---

## Decisions and open readings

- **REQ-COMBAT-002 is a correction, not a new feature.** `shotPenalty` in `module/wf-gun-deck.mjs`
  computes `-index` across every shot in a `flip()` call. That is right only when every shot is on one
  action die. The rule resets the penalty per action die — "fire single shots per action die
  **without** the cumulative -1 penalty" — so a character with two action dice firing two shots on
  each takes 0, −1, 0, −1 and not 0, −1, −2, −3. The shipped behaviour over-penalises, and silently.
- **The ROF ceiling counts bullets per ROUND, across all action dice**, not per action die: "at no
  time can the total number of bullets fired exceed the RoF listed for the gun in use". Fanning is the
  documented exception and is not capped by ROF.
- **Range bands are read from DCC's `system.range`**, not from a WF flag. The printed format is
  `short/medium/long` in feet (`10/20/60`); 73 of the 75 shipped guns match it exactly. The two that
  do not are the LeMat and its sibling, which print a second barrel's ranges in parentheses
  (`10/20/60 (5/15/25)`) — the parenthetical is the shot barrel and must not be read as a fourth band.
- **Beyond long range is not a band.** The book gives three bands and no modifier past the third, so
  a distance beyond long range is reported as out of range rather than given an invented penalty.
- **`reloadTime` of `1/3` means one bullet per three rounds, not three bullets per round.** The
  fraction reads as bullets-per-round, so the inverse is the rounds-per-bullet the prose describes. A
  naive `Number('1/3')` is `NaN`; a naive split that took the first number would read it as 1 round
  per bullet, which is three times too fast.
- **The distress check is per round, not per bullet.** "must pass a DC 10 Agility check **each
  round**". On a failure the dropped ammo is `1d6` rounds, or "a die that appropriately matches the
  firearm" for higher capacities — a judge call, so the die is a parameter with 1d6 as the default.
- **A conceal tie goes to the higher Luck SCORE, not the modifier.** The text says "higher Luck
  score". If both scores tie as well, the result is reported as a tie for the judge rather than
  resolved by an invented tiebreak.

**Out of scope:** the rest of the Reference Guide's situational-modifier table (blinded, entangled,
higher ground, firing into melee, non-signature weapon, and the defender's conditions). Those are
general DCC-style situational calls that apply to every attack, not firearm mechanics, and shipping
them as automation would mean deciding when each applies. The table itself is quoted in
`docs/wf-mechanics-delta.md` for reference.
