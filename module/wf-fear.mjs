/* global ChatMessage, Roll, console, game */
/**
 * The Grit / Fear / Madness loop (specs/03-fear-madness.md).
 *
 * WHAT THIS APPLIES AND WHAT IT ONLY REPORTS. It writes exactly two things to the character: the
 * temporary Grit total, and the `reachedZero` flag that `endAdventure()` later spends. Everything
 * else the rules hand to the judge is *reported in the chat card and never applied* — the +1d
 * against the source on a critical success, the source's +1d attacks on a critical failure, the -1d
 * from Madness, the per-source immunity after a success, and the specific phobia or disorder. Same
 * discipline as the Gun Deck: a module that silently writes a judge's ruling onto a sheet is worse
 * than one that shows the number.
 *
 * WHY THERE IS NO HOOK. DCC emits nothing for "something frightening happened", and
 * `dcc.rollWeaponAttack` is documented but never fired in 0.70.50, so this is an API the judge (or
 * a macro) calls. Reached as `game.modules.get('wfvtt').api.fear`.
 *
 * NO GM DELEGATION IS NEEDED, unlike the Gun Deck. That needed
 * `game.dcc.socket.executeAsGM` because `CARDS_CREATE` is granted to roles [3,4] only and folder
 * creation is GM-only. Here a player updates their OWN actor and posts a chat message, both of
 * which an owner may do, and reads a compendium RollTable, which is a read. Verified from a real
 * player context rather than assumed: a GM-only test cannot see a permission bug at all.
 */
import { MODULE_ID } from './wf-firearm.mjs'
import { parseHitDice } from './wf-monster-crit-data.mjs'

/** `DC 8 + the number of Hit Dice the creature has + any Hex tokens` (`V6:3229`). */
const BASE_DC = 8

/** The compendium tables. Looked up by name so a world copy can override them. */
const FEAR_PACK = `${MODULE_ID}.wf-fear`
const FEAR_TABLE = 'Fear Table'
const MADNESS_TABLE = 'Madness Table'

/**
 * Fetch a table by name, preferring a world table of the same name so a judge can substitute their
 * own. The passage that governs the crit charts explicitly encourages judges to "create their own
 * unique tables", and there is no reason Fear should be more closed than that.
 *
 * @param {string} name
 * @returns {Promise<RollTable|null>}
 */
async function tableNamed (name) {
  const world = game.tables?.getName?.(name)
  if (world) return world
  const pack = game.packs.get(FEAR_PACK)
  if (!pack) return null
  const index = await pack.getIndex()
  const entry = index.find(e => e.name === name)
  return entry ? pack.getDocument(entry._id) : null
}

/**
 * The one row a total resolves to, as plain text.
 *
 * `getResultsForRoll` is Foundry's own range matcher, so the open-ended outer rows ("1 or less",
 * "30+", and both outer Madness bands) are honoured by the platform rather than re-implemented
 * here. Those rows MUST be open: the modifiers are flat, so a Fear total can go negative on high
 * Luck and past 30 against a big creature, and a Madness total leaves 0-100 routinely.
 *
 * @param {RollTable|null} table
 * @param {number} total
 * @returns {{text: string, missing: boolean}}
 */
function lookup (table, total) {
  if (!table) return { text: '', missing: true }
  const hits = table.getResultsForRoll(total)
  if (hits.length !== 1) {
    // Loud rather than silent: a total matching 0 or 2 rows is the exact failure the open-ended
    // bounds exist to prevent, and it is invisible in play.
    console.warn(`${MODULE_ID} | ${table.name}: total ${total} matched ${hits.length} rows`)
  }
  const text = hits.map(h => h.description ?? '').join(' ')
  return { text: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), missing: !hits.length }
}

const num = (v) => Number(v ?? 0) || 0

/**
 * Grit is a PLAYER-only field (`dcc.definePlayerSchema`), so an NPC has no
 * `system.attributes.grit` at all. DCC's data models validate strictly, so an update to a path the
 * NPC schema does not define throws — and the throw would happen AFTER a roll and a Grit
 * calculation, which reads as a mysterious crash rather than "wrong actor type". Fail first and say
 * which actor.
 *
 * @param {Actor} actor
 * @param {string} fn
 */
function requireGrit (actor, fn) {
  if (!actor) throw new Error(`${MODULE_ID} | ${fn} requires an actor`)
  if (!actor.system?.attributes?.grit) {
    throw new Error(`${MODULE_ID} | ${fn}: ${actor.name} (${actor.type}) has no Grit. Grit is a ` +
      'Player-only field — monsters have a Fear DC derived from their HD, not a Grit pool.')
  }
}

/**
 * Hit Dice as a COUNT, from either a number or DCC's dice-notation string.
 *
 * `system.attributes.hitDice.value` is free text that DCC cleans to valid dice notation — '5d8',
 * '1d4+2', '2', '½d4' — so the obvious `Number(hd)` yields NaN for almost every real monster, and a
 * `Number(x) || 0` helper then quietly turns a 5 HD horror into 0 HD: the DC drops by 5 and the Grit
 * loss drops to 1. Silent and entirely wrong. `parseHitDice` already solves this for the NPC sheet,
 * so it is reused rather than reimplemented.
 *
 * Unreadable-but-present input THROWS rather than defaulting to 0: a judge who passed something is
 * owed an error, not a wrong DC. Absent or zero means "a creature did not cause the check", which is
 * a real case the rules name.
 *
 * @param {number|string|null|undefined} hitDice
 * @returns {number} a non-negative HD count, floored
 */
function hdCount (hitDice) {
  if (hitDice === null || hitDice === undefined || hitDice === '' || hitDice === 0) return 0
  const parsed = typeof hitDice === 'number' ? hitDice : parseHitDice(hitDice)
  if (parsed === null || Number.isNaN(parsed)) {
    throw new Error(`${MODULE_ID} | gritCheck: could not read Hit Dice from ${JSON.stringify(hitDice)}. ` +
      "Pass a number, or DCC's hitDice.value such as '5d8'. Omit it when no creature caused the check.")
  }
  // Floored to match what the NPC sheet already shows as the Fear DC (8 + floor(HD)), so a ½ HD
  // creature does not produce a fractional DC here and a different one there.
  return Math.max(0, Math.floor(parsed))
}

/**
 * Roll a Grit check and resolve everything that follows from it.
 *
 * @param {Actor} actor                 the character making the check
 * @param {object} [options]
 * @param {number|string} [options.hitDice] HD of the creature responsible — a number, or DCC's
 *   `system.attributes.hitDice.value` dice notation ('5d8'). Omit it when no creature caused
 *   the check, which the rules treat as 1 point of Grit rather than 0.
 * @param {number} [options.situational] judge's modifier to the DC (`V6:3229`)
 * @param {string} [options.source]     what frightened them, for the chat card and the immunity note
 * @returns {Promise<object>} the full resolution
 */
export async function gritCheck (actor, { hitDice = 0, situational = 0, source = '' } = {}) {
  requireGrit(actor, 'gritCheck')
  const hd = hdCount(hitDice)
  const sys = actor.system ?? {}
  const grit = sys.attributes?.grit ?? {}
  const hexes = num(sys.attributes?.hexes)
  const luckMod = num(sys.abilities?.lck?.mod)
  const willMod = num(sys.saves?.wil?.value)

  const dc = BASE_DC + hd + hexes + num(situational)
  const roll = await new Roll('1d20 + @will', { will: willMod }).evaluate()
  const natural = roll.dice[0]?.results?.[0]?.result ?? roll.total
  const total = roll.total

  // A natural 20 succeeds and a natural 1 fails REGARDLESS OF THE TOTAL, and this is not an
  // inference from the Grit section — it is Weird Frontiers' own global d20 rule
  // (`Weird_Frontiers_V6.md:528`): "If you roll equal to or higher than the DC (or AC), you succeed.
  // Otherwise you fail. A roll of an unmodified 1 is an automatic failure, is a fumble and brings
  // some degree of disaster depending upon the task at hand. Rolling an unmodified 20 is an
  // automatic critical success!"
  //
  // Worth recording how this was settled, because the local wording alone is ambiguous: one reading
  // (citing DCC core's saving-throw rule) and rejected it on the next, arguing the Grit section's
  // "matches or beats the DC" governs and a natural 20 falling short is a failure that merely also
  // grants the bonuses. Neither pass cited `:528`. The general rule is in WF itself, is about d20
  // rolls generally, and is explicit — so it governs, and the local section does not need to repeat
  // it.
  const criticalSuccess = natural === 20
  const criticalFailure = natural === 1
  const passed = criticalSuccess || (!criticalFailure && total >= dc)

  const out = {
    actor: actor.name,
    source,
    dc,
    // Both reported, so a judge can see what was read out of a '5d8'.
    hitDice: hd,
    hitDiceRaw: hitDice ?? null,
    situational: num(situational),
    hexes,
    luckMod,
    willMod,
    roll,
    natural,
    total,
    outcome: criticalSuccess ? 'criticalSuccess' : criticalFailure ? 'criticalFailure' : passed ? 'success' : 'failure',
    passed,
    // Reported, never applied.
    notes: []
  }

  const startingTotal = num(grit.startingTotal)
  const permanentLoss = num(grit.permanentLoss)
  const effectiveMax = Math.max(0, startingTotal - permanentLoss)
  const before = num(grit.value)
  out.grit = { before, startingTotal, permanentLoss, effectiveMax }

  if (passed) {
    out.notes.push({ key: 'WF.Fear.NoteImmune', data: { source: source || game.i18n.localize('WF.Fear.ThisSource') } })
    if (criticalSuccess) {
      // "the character's Grit total improves by +1 but cannot exceed its starting score". The cap
      // is the EFFECTIVE max — starting total less permanent erosion — not the raw starting score,
      // or a character who has eroded would heal past their own ceiling.
      const after = Math.min(effectiveMax, before + 1)
      out.grit.after = after
      out.grit.gained = after - before
      if (after !== before) await actor.update({ 'system.attributes.grit.value': after })
      out.notes.push({ key: 'WF.Fear.NoteCritSuccessBonus' })
      // A natural 20 earns a Boon (`V6:3199`). Reported, not awarded — see the Hex note below.
      out.notes.push({ key: 'WF.Fear.NoteBoonEarned' })
    } else {
      out.grit.after = before
      out.grit.gained = 0
    }
    await postCard(actor, out)
    return out
  }

  // --- Failure. "loses temporary Grit points equal to the number of Hit Dice the creature
  // responsible for the check has or 1 point if a creature did not cause the check", doubled on a
  // natural 1.
  // "loses temporary Grit points equal to the number of Hit Dice the creature responsible for the
  // check has or 1 point if a creature did not cause the check". A critical failure loses "twice the
  // number of Hit Dice the creature has" — and note that sentence does NOT repeat the creatureless
  // fallback. With no creature there are no Hit Dice to double, so the Failure rule's flat 1 stands
  // rather than being doubled to 2.
  //
  // An earlier version doubled the fallback. That was an inference, and the rule here is that a
  // shipped number must be quotable: the book is silent, so the conservative reading wins. A
  // creatureless critical failure is still worse than a plain one, because a natural 1 produces a
  // far larger failure margin and therefore a worse Fear row.
  //
  // `hd` is a floored integer, so `lost` is always an integer — the Grit field is `integer: true`
  // and a fractional update would be rejected by the data model.
  const lost = criticalFailure ? (hd > 0 ? hd * 2 : 1) : (hd || 1)
  const after = Math.max(0, before - lost)
  out.grit.after = after
  out.grit.lost = before - after
  out.grit.lostNominal = lost

  // "uses the amount the check failed by modified by Luck (positive Luck modifiers subtract from
  // the total) and Hex tokens (add +1 per token) to consult the Fear chart". V6, three times; the
  // Reference Guide's "Roll 1d20 modified by" is not followed; see `fear.conflict` in the data file.
  const margin = dc - total
  out.fear = { margin, index: margin - luckMod + hexes }
  const fearTable = await tableNamed(FEAR_TABLE)
  const fear = lookup(fearTable, out.fear.index)
  out.fear.text = fear.text
  out.fear.missing = fear.missing
  if (criticalFailure) out.notes.push({ key: 'WF.Fear.NoteCritFailureAttacks' })
  // A natural 1 earns a Hex "at any point" (`V6:3207`). Reported, not awarded: the standing
  // decision for this module is that Boons and Hexes stay manual counters, because reversing them
  // is a judgement call about what the roll was for and auto-awarding would mean hooking every
  // roll in the system.
  if (criticalFailure) out.notes.push({ key: 'WF.Fear.NoteHexEarned' })

  const update = { 'system.attributes.grit.value': after }

  if (after === 0) {
    // "must immediately roll a d% modified by …". The Madness SECTION is followed rather than the
    // "Reaching Zero Grit" sentence, which says only "Luck x 10%" and omits Hex tokens.
    const mRoll = await new Roll('1d100 + @mod', { mod: -10 * luckMod + 10 * hexes }).evaluate()
    const mTable = await tableNamed(MADNESS_TABLE)
    const band = lookup(mTable, mRoll.total)
    out.madness = {
      roll: mRoll,
      modifier: -10 * luckMod + 10 * hexes,
      total: mRoll.total,
      text: band.text,
      missing: band.missing
    }
    out.notes.push({ key: 'WF.Fear.NoteMadnessPenalty' })
    out.notes.push({ key: 'WF.Fear.NoteAfflictionIsJudges' })
    // Remembered, not spent: the permanent -1 lands at the END of the adventure (REQ-FEAR-007).
    if (!grit.reachedZero) update['system.attributes.grit.reachedZero'] = true
    out.notes.push({ key: 'WF.Fear.NoteErosionPending' })
  }

  await actor.update(update)
  await postCard(actor, out)
  return out
}

/**
 * End-of-adventure Grit recovery (REQ-FEAR-007).
 *
 * "Characters regain Grit up to their original starting total at the end of each adventure, unless
 * the character was reduced to a Grit score of zero during the current adventure. If this is the
 * case, the character's Grit total is permanently reduced by 1" (`V6:3245`).
 *
 * Deliberately a separate, explicitly invoked call: an adventure is "1-4 sessions … an entire
 * module", which nothing in Foundry can infer. Nothing here deletes or disables a retired
 * character — permanent zero means "unfit for play" and the book keeps them in the story as an NPC.
 *
 * @param {Actor} actor
 * @returns {Promise<object>}
 */
export async function endAdventure (actor) {
  requireGrit(actor, 'endAdventure')
  const grit = actor.system.attributes.grit
  const startingTotal = num(grit.startingTotal)
  const before = num(grit.value)
  const eroded = grit.reachedZero === true
  const permanentLoss = num(grit.permanentLoss) + (eroded ? 1 : 0)
  const effectiveMax = Math.max(0, startingTotal - permanentLoss)

  await actor.update({
    'system.attributes.grit.value': effectiveMax,
    'system.attributes.grit.permanentLoss': permanentLoss,
    'system.attributes.grit.reachedZero': false
  })

  const out = {
    actor: actor.name,
    before,
    after: effectiveMax,
    eroded,
    permanentLoss,
    startingTotal,
    // "Characters reaching a permanent 0 Grit score have gone insane and are unfit for play."
    retired: startingTotal > 0 && effectiveMax === 0
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="wf-fear"><h4>${game.i18n.localize('WF.Fear.AdventureEnd')}</h4>` +
      `<p>${game.i18n.format(eroded ? 'WF.Fear.RecoveredEroded' : 'WF.Fear.Recovered', out)}</p>` +
      (out.retired ? `<p class="wf-fear-retired">${game.i18n.localize('WF.Fear.Retired')}</p>` : '') +
      '</div>'
  })
  return out
}

/** The chat card. Everything the judge has to apply by hand is listed explicitly. */
async function postCard (actor, out) {
  const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k))
  const rows = [
    `<p><strong>${L('WF.Fear.CheckLine', out)}</strong></p>`,
    `<p>${L(`WF.Fear.Outcome.${out.outcome}`)}</p>`
  ]
  if (out.source) rows.push(`<p><em>${L('WF.Fear.Source', { source: out.source })}</em></p>`)
  if (out.grit.gained) rows.push(`<p>${L('WF.Fear.GritGained', out.grit)}</p>`)
  if (out.grit.lost) rows.push(`<p>${L('WF.Fear.GritLost', out.grit)}</p>`)
  if (out.fear) {
    rows.push(`<p><strong>${L('WF.Fear.FearIndex', out.fear)}</strong></p>`)
    rows.push(out.fear.missing
      ? `<p class="wf-fear-missing">${L('WF.Fear.NoRow', out.fear)}</p>`
      : `<p class="wf-fear-row">${out.fear.text}</p>`)
  }
  if (out.madness) {
    rows.push(`<p><strong>${L('WF.Fear.MadnessLine', out.madness)}</strong></p>`)
    rows.push(out.madness.missing
      ? `<p class="wf-fear-missing">${L('WF.Fear.NoRow', out.madness)}</p>`
      : `<p class="wf-fear-row">${out.madness.text}</p>`)
  }
  if (out.notes.length) {
    rows.push(`<ul class="wf-fear-notes">${out.notes
      .map(n => `<li>${L(n.key, n.data)}</li>`).join('')}</ul>`)
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: L('WF.Fear.GritCheck'),
    rolls: [out.roll, ...(out.madness ? [out.madness.roll] : [])],
    content: `<div class="wf-fear">${rows.join('')}</div>`
  })
}

/**
 * Registered from `init`. Nothing here touches a compendium at registration time: the tables are
 * fetched lazily on the first call, because packs are not readable until `ready` and the module's
 * `init` runs well before that.
 */
export function registerFear () {
  const module = game.modules.get(MODULE_ID)
  if (!module) return
  module.api = module.api ?? {}
  module.api.fear = { gritCheck, endAdventure, tableNamed, BASE_DC }
}
