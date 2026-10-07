/**
 * Weird Frontiers firearm data — the shape, its defaults, and a normaliser.
 *
 * WHY FLAGS AND NOT THE SCHEMA. The DCC system exposes `dcc.defineBaseActorSchema` and
 * `dcc.definePlayerSchema` for ACTORS and has no equivalent for items — grep-verified across
 * `reference/dcc/module/data/`: the only `Hooks.callAll` in any data model is those two. So a
 * module cannot add typed fields to the `weapon` item. The alternatives were:
 *
 *   - a module-defined Item sub-type (`wfvtt.firearm`) — rejected: DCC's attack pipeline keys on
 *     `type === 'weapon'` (`itemTypes.weapon`), so a firearm has to BE a weapon;
 *   - forking the system — rejected on the same grounds as the whole project;
 *   - `flags.wfvtt.*` — Foundry's documented escape hatch for one package adding data to another
 *     package's documents. Chosen.
 *
 * The cost is real and worth stating: flags are untyped. There is no schema validation, no
 * automatic cleaning of an emptied input, and nothing stops a malformed value being written by
 * hand or by another module. `normaliseFirearm()` below is what stands in for the validation the
 * schema would have given us, and every read should go through it.
 *
 * An upstream `dcc.defineItemSchema` hook would remove the need for all of this. Worth raising
 * with the DCC maintainers rather than working around forever.
 */

export const FIREARM_FLAG = 'firearm'
export const MODULE_ID = 'wfvtt'

/**
 * Action type is stored as the VERBATIM printed string, not an enum.
 *
 * It was an enum of single/double/lever until the advanced firearms tables were read properly.
 * The book actually prints: Single, Double, `Single/Double`, `Muzzleloading Single`,
 * `Breechloading Single` (and `Breechloading single`, lowercase), `Lever`, and
 * `Single (Hand rotated)` for the 18-barrel pepperbox
 * (`Weird_Frontiers_Reference_Guide.md:1506-1632`). An enum silently dropped every value it did
 * not know, which is the worst possible failure for compendium data.
 *
 * What actually matters mechanically is whether the gun is single-action, because only a
 * single-action gun can be fanned (`Weird_Frontiers_Reference_Guide.md:1362-1364`). That is a
 * derived question — see `isSingleAction()` — not a storage one.
 */

/**
 * True when the printed action type includes single action, and the gun can therefore be fanned.
 * `Single/Double` counts: it can be fired either way.
 *
 * @param {string} actionType
 * @returns {boolean}
 */
export function isSingleAction (actionType) {
  return /single/i.test(actionType ?? '')
}

/**
 * Damage type, which selects the critical-hit chart. WF keys crit tables to damage type —
 * Blunt / Piercing / Slashing / Firearms / Wrestling (`Weird_Frontiers_V6.md:2866`) — where DCC
 * keys them to class and level. Firearms always use the Firearms chart regardless of this field.
 */
// NOTE the `DamageTypeOption` prefix. These cannot live under `WF.Firearm.DamageType.*`,
// because `WF.Firearm.DamageType` is itself a key (the field's label). Foundry expands flat
// dotted keys into a nested object, so a key that is both a leaf and a branch throws during
// expansion and Foundry then discards the ENTIRE language file — every key, not just the
// clashing pair. `tools/check_lang.py` guards against it in `npm run verify`.
export const DAMAGE_TYPES = {
  '': 'WF.Firearm.DamageTypeOption.None',
  s: 'WF.Firearm.DamageTypeOption.Slashing',
  b: 'WF.Firearm.DamageTypeOption.Blunt',
  p: 'WF.Firearm.DamageTypeOption.Piercing'
}

/** The shape stored at `flags.wfvtt.firearm`. */
export const FIREARM_DEFAULTS = Object.freeze({
  isFirearm: false,
  // Caliber. A string, not a number: the book prints ".41", ".44" and "10-12 gauge"
  // (`Weird_Frontiers_Reference_Guide.md:1444-1456`).
  caliber: '',
  // Verbatim, e.g. 'Single', 'Single/Double', 'Breechloading Single'. See above.
  actionType: '',
  // Ammunition: C&B (cap and ball), Cart. (cartridge), ML/C&B, ML/Flintlock, Pinfire Cart.,
  // Volcanic "Rocketball", Paper Cart. (`Weird_Frontiers_Reference_Guide.md:1366`).
  ammo: '',
  // Rate of fire, stored VERBATIM. Not a number: the Coach Gun prints `1 or 2` and the LeMat
  // prints `2 (1)` for its second barrel (`Weird_Frontiers_Reference_Guide.md:1521`, `:1626`).
  // An integer field would have silently truncated both. `rofCeiling()` derives the number.
  //
  // ROF is a hard mechanical ceiling: "a gun can never fire more bullets in one round than the
  // stated ROF" even with extra action dice (`Weird_Frontiers_V6.md:3076`). Each shot after the
  // first ON THE SAME ACTION DIE takes a cumulative -1 (`Reference_Guide.md:1370`).
  rof: '',
  // Capacity. A string, because the book prints "1 or 2" for shotguns
  // (`Weird_Frontiers_Reference_Guide.md:1454`).
  load: '',
  // Reload time, stored VERBATIM as printed. See the note on reloadTime ambiguity below.
  reloadTime: '',
  // Conceal modifier, added to a contested Intelligence check to hide the weapon; ties go to the
  // higher Luck (`Weird_Frontiers_V6.md:2966-2970`, `Reference_Guide.md:1368`). Ranges from about
  // -8 (musket) to +4 (derringer), so it is signed.
  conceal: 0,
  // Year of introduction — flavour and judge adjudication. Printed only in the SIMPLIFIED
  // table; the advanced tables print PRICE instead.
  year: '',
  // Price in dollars. DCC's `system.value` is a coin field (pp/ep/gp/sp/cp), which WF does not
  // use — same reason Dinero is its own field.
  price: 0,
  // The price EXACTLY as printed. The number above is for sorting and arithmetic; this keeps
  // what a float cannot carry — the Philadelphia Deringer prints "$15 for pair", and three
  // derringers print a bare number with no "$". Same reasoning as actionType and rof: a numeric
  // field silently truncates printed nuance.
  priceText: '',
  // Banded damage as printed, e.g. "d14/d10/d7" for short/medium/long (a shotgun,
  // `Weird_Frontiers_Reference_Guide.md:1454`). THIS IS WHY IT IS NOT IN `system.damage`:
  // Foundry's Roll parses "/" as division. `new Roll('d14/d10/d7').evaluate()` produces the
  // formula "1d14 / 1d10 / 1d7" with OperatorTerms and a total of ~1 — verified live, it
  // returned 1.2. A shotgun would have rolled about 1 point of damage instead of d14, silently.
  // `system.damage` holds a single valid formula (the short band); this string is the printed
  // profile, for the judge and for later automation.
  bandedDamage: '',
  // A LeMat-style gun's SECOND barrel, printed in parentheses — e.g. "d10/d6/d4" for the
  // LeMat Revolver's shotgun barrel (`Weird_Frontiers_Reference_Guide.md:1521`). Its ROF and
  // load are likewise printed parenthesised in those columns. Recorded, not automated.
  secondBarrelDamage: '',
  // A melee profile some guns carry, e.g. "d4 melee" for Reid's Knuckleduster.
  meleeNote: '',
  // S/B/P for the crit chart. Not firearm-specific, but it lives here so a weapon carries one
  // WF flag rather than two.
  damageType: ''
})

/**
 * RELOAD TIME IS STORED VERBATIM, AND DELIBERATELY NOT INTERPRETED.
 *
 * Both books give the same definition — "the number of rounds it takes to reload a single bullet
 * into the firearm" (`Weird_Frontiers_V6.md:3082`, `Reference_Guide.md:1372`) — and the Reference
 * Guide adds "1/3 means 1 bullet every 3 rounds".
 *
 * That gloss cannot be right as written. Under it, a printed "3" (3 rounds per bullet) and a
 * printed "1/3" would mean the same thing, yet the table uses both: the musket reloads at "3"
 * and the .44 lever-action at "1/3" (`Reference_Guide.md:1448`, `:1450`). A lever-action
 * repeater reloading no faster than a muzzleloading musket is not a plausible reading. The
 * natural reading of the fraction is "1/3 of a round per bullet", i.e. three bullets a round.
 *
 * Rather than bake either reading into the data, the printed string is stored as-is. It cannot
 * be wrong, the ~90-gun compendium can be authored now, and the interpretation can be settled
 * once — in one place — when the rule is adjudicated. Tracked as a judge call in specs/01.
 */

/**
 * Read the firearm flag off an item, coerced into the documented shape.
 *
 * Flags are untyped, so anything here may be absent, a string where a number belongs, or junk.
 * Every read goes through this rather than touching `flags.wfvtt.firearm` directly.
 *
 * @param {Item} item
 * @returns {typeof FIREARM_DEFAULTS}
 */
export function normaliseFirearm (item) {
  const raw = item?.flags?.[MODULE_ID]?.[FIREARM_FLAG] ?? {}
  const int = (value, fallback) => {
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : fallback
  }
  const str = (value) => (typeof value === 'string' ? value.trim() : '')

  return {
    isFirearm: raw.isFirearm === true,
    caliber: str(raw.caliber),
    actionType: str(raw.actionType),
    ammo: str(raw.ammo),
    rof: str(raw.rof),
    load: str(raw.load),
    reloadTime: str(raw.reloadTime),
    conceal: int(raw.conceal, 0),
    year: str(raw.year),
    price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : 0,
    priceText: str(raw.priceText),
    bandedDamage: str(raw.bandedDamage),
    secondBarrelDamage: str(raw.secondBarrelDamage),
    meleeNote: str(raw.meleeNote),
    damageType: Object.hasOwn(DAMAGE_TYPES, raw.damageType) ? raw.damageType : ''
  }
}

/**
 * The attack penalty for firing `shot` shots on one action die this round: the first is
 * unmodified, each subsequent one is a cumulative -1
 * (`Weird_Frontiers_Reference_Guide.md:1370`, `Weird_Frontiers_V6.md:3076`).
 *
 * Note this is the NON-fanning penalty. Fanning the hammer is -1d per shot for everyone except
 * a gunslinger, who takes the flat -1 instead (`Weird_Frontiers_V6.md:3134-3136`, `:1387`).
 *
 * @param {number} shot - 1-indexed shot number within the round.
 * @returns {number} zero or negative
 */
/**
 * The highest number of shots a printed ROF allows. `'3'` -> 3, `'1 or 2'` -> 2, `'2 (1)'` -> 2
 * (the parenthesised figure is the LeMat's second barrel, not a larger ceiling).
 *
 * @param {string} rof
 * @returns {number} at least 1
 */
export function rofCeiling (rof) {
  const outsideParens = String(rof ?? '').replace(/\([^)]*\)/g, ' ')
  const numbers = outsideParens.match(/\d+/g)?.map(Number) ?? []
  return numbers.length ? Math.max(...numbers) : 1
}

export function rofPenalty (shot) {
  // Math.min rather than negating a Math.max: `-Math.max(0, 0)` is -0, which stringifies as
  // "-0" and would reach a chat card that way.
  return Math.min(0, 1 - Math.trunc(shot))
}

/**
 * The attack modifier for one shot, given its position WITHIN its action die.
 *
 * One home for a rule two subsystems need: the Gun Deck reports it per flipped card, and
 * `planVolley` reports it for a whole round. They had separate copies, which is how the two
 * drifted in the first place — the deck ignored action dice while `rofPenalty`'s own docblock said
 * the penalty was per action die.
 *
 * Non-fanning is the flat cumulative -1 (`Weird_Frontiers_V6.md:3076`). Fanning is -1d per shot for
 * everyone EXCEPT a gunslinger, who takes the flat -1 instead (`:3134-3136`,
 * `Weird_Frontiers_Reference_Guide.md:1387`).
 *
 * @param {number} within   0-based index of this shot within its own action die
 * @param {object} [options]
 * @param {boolean} [options.fanning]
 * @param {boolean} [options.gunslinger]
 * @returns {{text: string, diceStep: boolean, steps: number, flat: number}}
 */
export function shotModifier (within, { fanning = false, gunslinger = false } = {}) {
  const i = Math.max(0, Math.trunc(Number(within) || 0))
  if (fanning && !gunslinger) {
    return { text: i === 0 ? '0' : `-${i}d`, diceStep: i > 0, steps: i, flat: 0 }
  }
  const flat = rofPenalty(i + 1)
  return { text: String(flat), diceStep: false, steps: 0, flat }
}

/**
 * Flat attack modifier for a range band. WF uses flat modifiers — short +1, medium 0, long -1
 * (`Weird_Frontiers_V6.md:2902`, `Reference_Guide.md` situational table at `:1343`) — where DCC
 * uses range categories that affect damage. Exported for the attack wiring, which is not built
 * yet; kept here so the number has one home.
 *
 * @param {'short'|'medium'|'long'} band
 * @returns {number}
 */
export function rangeBandModifier (band) {
  return { short: 1, medium: 0, long: -1 }[band] ?? 0
}

/**
 * True when a damage string would be mis-parsed by Foundry's Roll as division.
 *
 * The trap this guards: a banded shotgun profile pasted straight into `system.damage`.
 * `new Roll('d14/d10/d7')` is a legal formula — it does not throw — it just quietly means
 * "d14 divided by d10 divided by d7" and totals about 1. There is no error to notice, so the
 * sheet warns instead.
 *
 * @param {string} damage
 * @returns {boolean}
 */
export function looksLikeBandedDamage (damage) {
  return typeof damage === 'string' && damage.includes('/')
}
