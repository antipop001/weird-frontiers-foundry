/* global ChatMessage, Roll, game */
/**
 * Firearm combat modifiers (specs/04-combat.md).
 *
 * NOTHING HERE IS APPLIED. DCC rolls its own attacks (`rollWeaponAttack`), and injecting a modifier
 * into that roll would mean monkey-patching the system, which this project forbids. So this reports
 * the numbers for a shot plan and the judge or player applies them — the same discipline as the Gun
 * Deck and the Fear loop. The one thing it does roll is a contested check and the reload distress
 * check, because those are checks in their own right rather than modifiers to someone else's.
 *
 * Every value these rules need already ships on the firearm (REQ-SHEET-005) and
 * `module/wf-firearm.mjs` already exports the arithmetic. This is the wiring its comments promised.
 *
 * Reached as `game.modules.get('wfvtt').api.combat`.
 */
import { FIREARM_FLAG, MODULE_ID, isSingleAction, rangeBandModifier, rofCeiling, shotModifier } from './wf-firearm.mjs'

/**
 * Cover bonuses to the DEFENDER's AC (`Weird_Frontiers_V6.md:2972`, and the Reference Guide's
 * situational table at `:1343`). Not attack penalties — they raise AC, which is a different
 * quantity and matters if anything ever automates the comparison.
 */
export const COVER = Object.freeze({ none: 0, partial: 1, half: 2, full: 4 })

/** @param {keyof COVER} kind @returns {number} */
export function coverBonus (kind) {
  return COVER[kind] ?? 0
}

const gun = (item) => item?.getFlag?.(MODULE_ID, FIREARM_FLAG) ?? item?.flags?.[MODULE_ID]?.[FIREARM_FLAG] ?? {}
const num = (v) => Number(v ?? 0) || 0

/**
 * The printed three-band range, in feet, from DCC's own `system.range`.
 *
 * The format is `short/medium/long` ('10/20/60'). Two of the 75 shipped guns print a SECOND
 * BARREL's ranges in parentheses — '10/20/60 (5/15/25)' is the LeMat's shot barrel — so the
 * parenthetical is stripped rather than read as a fourth band or allowed to corrupt the third.
 *
 * @param {Item|string} source  a weapon item, or the range string itself
 * @returns {{short: number, medium: number, long: number, printed: string, second: string|null}|null}
 */
export function parseRangeBands (source) {
  const printed = typeof source === 'string' ? source : (source?.system?.range ?? '')
  const text = String(printed ?? '').trim()
  if (!text) return null
  const secondMatch = text.match(/\(([^)]*)\)/)
  const outside = text.replace(/\([^)]*\)/g, ' ')
  const parts = outside.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (parts.length < 3) return null
  const [short, medium, long] = parts
  return { short, medium, long, printed: text, second: secondMatch ? secondMatch[1].trim() : null }
}

/**
 * Which band a distance falls in, and the attack modifier for it.
 *
 * "Short: +1 to attack, Medium: No modifier, Long: -1 to attack" (`Weird_Frontiers_V6.md:2902`).
 *
 * Beyond long range is reported as OUT OF RANGE rather than given an invented penalty: the book
 * gives three bands and says nothing about further out, and a made-up -2 would be exactly the kind
 * of inference this project does not ship.
 *
 * @param {Item|string} source
 * @param {number} distanceFt
 * @returns {{band: string|null, modifier: number, inRange: boolean, bands: object|null}}
 */
export function rangeBandFor (source, distanceFt) {
  const bands = parseRangeBands(source)
  const d = num(distanceFt)
  if (!bands) return { band: null, modifier: 0, inRange: false, bands: null, unknown: true }
  const band = d <= bands.short ? 'short' : d <= bands.medium ? 'medium' : d <= bands.long ? 'long' : null
  return {
    band,
    modifier: band ? rangeBandModifier(band) : 0,
    inRange: band !== null,
    bands
  }
}

/**
 * Reload time as ROUNDS PER SINGLE BULLET.
 *
 * "The reload times reflect the number of rounds it takes to reload a single bullet into the
 * firearm", and the Reference Guide pins the fraction: "**1/3 means 1 bullet each 3 rounds**"
 * (`:1374`). So `a/b` is a bullets per b rounds, and the rounds per bullet is `b / a` — NOT `a / b`.
 * The shipped data carries '1', '1/2', '1/3', '2', '3', '3 rds', '4' and '6'.
 *
 * Two traps worth naming: `Number('1/3')` is `NaN`, and a parser that simply took the first number
 * would read '1/3' as one round per bullet — three times too fast.
 *
 * @param {Item|string} source
 * @returns {{roundsPerBullet: number, printed: string}|null}
 */
export function parseReloadTime (source) {
  const printed = typeof source === 'string' ? source : (gun(source).reloadTime ?? '')
  const text = String(printed ?? '').trim()
  if (!text) return null
  const frac = text.match(/^(\d+)\s*\/\s*(\d+)/)
  if (frac) {
    const bullets = Number(frac[1])
    const rounds = Number(frac[2])
    if (!bullets || !rounds) return null
    return { roundsPerBullet: rounds / bullets, printed: text }
  }
  const n = text.match(/\d+(?:\.\d+)?/)
  return n ? { roundsPerBullet: Number(n[0]), printed: text } : null
}

/**
 * Plan a round's shots: is it legal under ROF, and what does each shot suffer?
 *
 * TWO SEPARATE RULES, and conflating them is the bug this fixes:
 *
 *  - **The ceiling counts bullets per ROUND, across every action die.** "at no time can the total
 *    number of bullets fired exceed the RoF listed for the gun in use unless fanning the hammer is
 *    employed" (`Weird_Frontiers_V6.md:3076`). Fanning is the documented exception and is not capped.
 *  - **The cumulative -1 resets PER ACTION DIE.** "Each bullet fired on the same action die per round
 *    after the first shot has a cumulative -1 penalty … they may choose to fire single shots per
 *    action die WITHOUT the cumulative -1 penalty or fire multiple shots per action die with the
 *    cumulative -1 penalty to each action die." So two action dice with two shots each is 0, -1, 0,
 *    -1 — not 0, -1, -2, -3.
 *
 * `perDie` is how many shots go on each action die, in order: `[2, 2]` is two dice with two shots
 * each. Omit it and every shot lands on one action die, which is the common case and the stricter
 * reading.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} [options]
 * @param {number} [options.shots]       total bullets this round
 * @param {number[]} [options.perDie]    shots per action die, in order
 * @param {'rof'|'fanning'} [options.mode]
 * @returns {object} the plan; `legal` is false when it breaks the ceiling
 */
export function planVolley (actor, item, { shots = 1, perDie = null, mode = 'rof' } = {}) {
  if (!['rof', 'fanning'].includes(mode)) {
    throw new Error(`${MODULE_ID} | planVolley: unknown mode ${JSON.stringify(mode)}`)
  }
  const total = Math.max(1, Math.trunc(num(shots)))
  const g = gun(item)
  const ceiling = rofCeiling(g.rof)

  let groups
  if (Array.isArray(perDie) && perDie.length) {
    groups = perDie.map(n => Math.max(0, Math.trunc(num(n)))).filter(n => n > 0)
    const summed = groups.reduce((a, b) => a + b, 0)
    if (summed !== total) {
      throw new Error(`${MODULE_ID} | planVolley: perDie sums to ${summed} but shots is ${total}. ` +
        'Pass perDie covering every shot, or omit it to put them all on one action die.')
    }
  } else {
    groups = [total]
  }

  // Fanning requires a single-action gun (`Weird_Frontiers_Reference_Guide.md:1362-1364`). Reported
  // rather than thrown: the judge may be ruling on something the table has house-ruled.
  const fanning = mode === 'fanning'
  const canFan = isSingleAction(g.actionType)
  const gunslinger = (actor?.system?.details?.sheetClass ?? '').toLowerCase() === 'gunslinger'

  const perShot = []
  let n = 0
  groups.forEach((count, die) => {
    for (let within = 0; within < count; within++) {
      n += 1
      perShot.push({
        shot: n,
        actionDie: die,
        shotOnDie: within + 1,
        // Shared with the Gun Deck through wf-firearm.mjs, so one rule has one implementation.
        modifier: shotModifier(within, { fanning, gunslinger })
      })
    }
  })

  const legal = fanning || total <= ceiling
  return {
    shots: total,
    mode,
    perDie: groups,
    actionDice: groups.length,
    rofPrinted: g.rof ?? '',
    ceiling,
    legal,
    // The ceiling is the per-ROUND limit; exceeding it is only allowed by fanning.
    overBy: legal ? 0 : total - ceiling,
    fanning,
    canFan,
    fanningRequiresSingleAction: fanning && !canFan,
    gunslinger,
    load: g.load ?? '',
    perShot
  }
}

/**
 * Reload: how many bullets go in, and what the distress checks cost.
 *
 * "Characters attempting to reload under times of distress must pass a DC 10 Agility check EACH
 * ROUND to do so reliably. Failing the check causes 1d6 rounds of ammo to drop on the ground (for
 * higher shot capacities, roll a die that appropriately matches the firearm)."
 *
 * The check is per round, not per bullet. The drop die is a parameter because the book makes it a
 * judge call for high-capacity guns; 1d6 is the stated default. Nothing is written to the actor —
 * this module does not track loaded ammunition, and inventing a field for it is not in the spec.
 *
 * @param {Actor} actor
 * @param {Item} item
 * @param {object} [options]
 * @param {number} [options.rounds]        rounds spent reloading
 * @param {boolean} [options.underDistress]
 * @param {string} [options.dropDie]
 * @returns {Promise<object>}
 */
export async function reload (actor, item, { rounds = 1, underDistress = false, dropDie = '1d6' } = {}) {
  const spent = Math.max(0, Math.trunc(num(rounds)))
  const time = parseReloadTime(item)
  if (!time) {
    return {
      actor: actor?.name ?? null,
      item: item?.name ?? null,
      unknownReloadTime: true,
      printed: gun(item).reloadTime ?? '',
      rounds: spent,
      loaded: 0,
      checks: [],
      dropped: 0
    }
  }

  const out = {
    actor: actor?.name ?? null,
    item: item?.name ?? null,
    printed: time.printed,
    roundsPerBullet: time.roundsPerBullet,
    rounds: spent,
    underDistress,
    checks: [],
    dropped: 0,
    capacity: gun(item).load ?? ''
  }

  if (!underDistress) {
    out.loaded = Math.floor(spent / time.roundsPerBullet)
    return out
  }

  // One DC 10 Agility check per round spent. A failed round still passes, but costs ammo.
  const aglMod = num(actor?.system?.abilities?.agl?.mod)
  let effective = 0
  for (let r = 0; r < spent; r++) {
    const roll = await new Roll('1d20 + @agl', { agl: aglMod }).evaluate()
    const passed = roll.total >= 10
    const entry = { round: r + 1, total: roll.total, passed, dropped: 0, roll }
    if (passed) {
      effective += 1
    } else {
      const drop = await new Roll(dropDie).evaluate()
      entry.dropped = drop.total
      entry.dropRoll = drop
      out.dropped += drop.total
    }
    out.checks.push(entry)
  }
  out.loaded = Math.floor(effective / time.roundsPerBullet)
  out.effectiveRounds = effective
  return out
}

/**
 * The concealment contest.
 *
 * "Make an Intelligence-based contested roll vs. anyone trying to spot the gun. In the case of a
 * tie, the winner is the one with the higher Luck score" (`Weird_Frontiers_V6.md:2966`), and the
 * Reference Guide gives the arithmetic: "Intelligence check + Conceal Mod. vs. target's check
 * result" (`:1372`).
 *
 * A tie on Luck as well is reported as a TIE rather than resolved: the book provides one tiebreak and
 * inventing a second is not ours to do. Note "higher Luck SCORE", so the ability value is compared,
 * not its modifier.
 *
 * @param {Actor} concealer
 * @param {Item} item
 * @param {Actor} spotter
 * @returns {Promise<object>}
 */
export async function concealCheck (concealer, item, spotter) {
  if (!concealer) throw new Error(`${MODULE_ID} | concealCheck requires the concealing actor`)
  if (!spotter) throw new Error(`${MODULE_ID} | concealCheck requires a spotter to contest against`)
  const conceal = num(gun(item).conceal)
  const hideInt = num(concealer.system?.abilities?.int?.mod)
  const seekInt = num(spotter.system?.abilities?.int?.mod)

  const hideRoll = await new Roll('1d20 + @int + @conceal', { int: hideInt, conceal }).evaluate()
  const seekRoll = await new Roll('1d20 + @int', { int: seekInt }).evaluate()

  const hideLuck = num(concealer.system?.abilities?.lck?.value)
  const seekLuck = num(spotter.system?.abilities?.lck?.value)

  let winner
  if (hideRoll.total > seekRoll.total) winner = 'concealed'
  else if (seekRoll.total > hideRoll.total) winner = 'spotted'
  else if (hideLuck > seekLuck) winner = 'concealed'
  else if (seekLuck > hideLuck) winner = 'spotted'
  else winner = 'tie'

  const out = {
    item: item?.name ?? null,
    concealModifier: conceal,
    conceal: { actor: concealer.name, total: hideRoll.total, intMod: hideInt, luck: hideLuck, roll: hideRoll },
    spot: { actor: spotter.name, total: seekRoll.total, intMod: seekInt, luck: seekLuck, roll: seekRoll },
    tiedOnRoll: hideRoll.total === seekRoll.total,
    decidedByLuck: hideRoll.total === seekRoll.total && winner !== 'tie',
    winner
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: concealer }),
    flavor: game.i18n.localize('WF.Combat.ConcealCheck'),
    rolls: [hideRoll, seekRoll],
    content: `<div class="wf-combat"><p>${game.i18n.format('WF.Combat.ConcealLine', {
      item: out.item ?? '',
      conceal: conceal >= 0 ? `+${conceal}` : String(conceal),
      hide: hideRoll.total,
      hider: concealer.name,
      seek: seekRoll.total,
      seeker: spotter.name
    })}</p><p><strong>${game.i18n.localize(`WF.Combat.Conceal.${winner}`)}</strong></p>` +
      (out.decidedByLuck ? `<p>${game.i18n.format('WF.Combat.ConcealByLuck', out)}</p>` : '') +
      '</div>'
  })
  return out
}

/** Registered from `init`. */
export function registerCombat () {
  const module = game.modules.get(MODULE_ID)
  if (!module) return
  module.api = module.api ?? {}
  module.api.combat = {
    planVolley,
    rangeBandFor,
    parseRangeBands,
    parseReloadTime,
    reload,
    concealCheck,
    coverBonus,
    COVER
  }
}
