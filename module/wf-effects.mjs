/* global Hooks, game */
/**
 * Keeps the Weird Frontiers values DCC would otherwise compute wrongly in sync, as Active
 * Effects. Two so far — the fumble die and the level-scaled AC bonus — and they need OPPOSITE
 * techniques, which is the interesting part.
 *
 * Foundry prepares a document `prepareBaseData` -> `applyActiveEffects` -> `prepareDerivedData`.
 * So where DCC computes a value decides what an effect can do to it:
 *
 *   - **Fumble die** is set in `prepareBaseData` (`reference/dcc/module/actor.js:76-99`), so an
 *     effect on `system.attributes.fumble.die` lands AFTER it and wins outright.
 *   - **AC** is computed in `prepareDerivedData` (`actor.js:226-243`), so an effect on
 *     `system.attributes.ac.value` is simply OVERWRITTEN — verified live, it changed nothing.
 *     But that computation reads `ac.otherMod`, which effects HAVE already touched, so the
 *     level bonus is added there instead and DCC's own formula carries it.
 *
 * Both effects are managed: the module only ever touches one carrying
 * `flags.wfvtt.managed`, so a GM's hand-made effects are never modified or deleted.
 *
 * THE PROBLEM. WF keys the fumble die to class and level — a gunslinger runs d12 at 1st down to
 * d3 at 10th (`Weird_Frontiers_V6.md:1405-1417`, `:2884`). DCC derives it from equipped armor
 * and overwrites `system.attributes.fumble.die` on EVERY prepareData, with no config gate
 * (`reference/dcc/module/actor.js:76-99`). WF has no armor at all, so that loop always falls
 * through to a hardcoded '1d4'. A value written by level data, or typed into the sheet, is
 * silently discarded — verified live before this was built.
 *
 * THE FIX. Foundry prepares a document in the order prepareBaseData -> applyActiveEffects ->
 * prepareDerivedData. DCC's overwrite is in prepareBaseData, so an Active Effect applies AFTER
 * it and wins. DCC also lists this exact key in its own Active Effect autocomplete
 * (`reference/dcc/module/active-effect-key-autocomplete.mjs:23`) and labels it in
 * `config.js:396`, so this is a sanctioned target, not a trick. Confirmed in-world: the value
 * survives an explicit prepareData(), survives an unrelated update, and falls back to 1d4 when
 * the effect is disabled.
 *
 * WHAT THIS CODE DOES. Level data cannot create an Active Effect, so the module maintains one
 * per actor and re-syncs it when the character's class or level changes.
 *
 * Two deliberate constraints, because an effect the module rewrites behind a GM's back is a
 * nasty surprise:
 *   - it only ever touches an effect carrying `flags.wfvtt.managed`, never a hand-made one;
 *   - the effect is named so it is obvious where it came from.
 */
import { fumbleDieFor } from './wf-fumble-data.mjs'
import { WF_CLASS_REGISTRY } from './wf-class-registry.mjs'
import { ZERO_LEVEL_CLASS_ID, ZERO_LEVEL_FUMBLE_DIE } from './wf-zero-level.mjs'

const MODULE_ID = 'wfvtt'
const EFFECT_NAME = 'Weird Frontiers Fumble Die'
const KEY = 'system.attributes.fumble.die'
const AC_EFFECT_NAME = 'Weird Frontiers AC Bonus'
const AC_KEY = 'system.attributes.ac.otherMod'

/**
 * `system.details.sheetClass` is the capitalised sentinel ('Gunslinger'); the fumble table is
 * keyed by classId ('gunslinger'). Deliberately NOT `system.class.className`, which is the
 * localized display label and breaks in a non-English game.
 */
const classIdOf = (actor) =>
  (actor.system?.details?.sheetClass ?? '').toLowerCase().replace(/\s+/g, '-')

/**
 * Per-actor promise chain, so two syncs for the same actor never interleave.
 *
 * The dedup in `reconcileManagedEffect` HEALS a duplicate, but only on the next sync — between
 * the two, the character really is walking around with +1 AC too much. Serializing removes the
 * window instead of cleaning up after it, for the case that actually occurred: an explicit
 * `syncManagedEffects()` racing the `updateActor` hook inside one client. A second GM client
 * can still race this one, which is what the dedup remains there for.
 *
 * Keyed by actor uuid and pruned when the chain drains, so this does not grow without bound.
 */
const inFlight = new Map()

function serialize (actor, fn) {
  const key = actor.uuid
  const previous = inFlight.get(key) ?? Promise.resolve()
  // `.catch` so one failed sync does not poison every later sync of the same actor.
  const next = previous.catch(() => {}).then(fn)
  inFlight.set(key, next)
  next.finally(() => { if (inFlight.get(key) === next) inFlight.delete(key) })
  return next
}

/**
 * Delete embedded effects, tolerating ones that are already gone.
 *
 * A second GM client can delete the same managed effect between our read of `actor.effects`
 * and our write. Foundry answers that with a hard throw — `ActiveEffect "<id>" does not
 * exist!` — which, inside an async `updateActor` hook, surfaces as an unhandled rejection that
 * aborts the rest of the sync silently. That is exactly how an AC effect got stranded on a
 * 0-level character while the fumble effect next to it was removed correctly.
 *
 * Losing this race is not an error: the effect is gone, which is what we wanted.
 */
async function deleteEffects (actor, ids) {
  const live = ids.filter(id => actor.effects.has(id))
  if (!live.length) return
  try {
    await actor.deleteEmbeddedDocuments('ActiveEffect', live)
  } catch (err) {
    const stillThere = live.filter(id => actor.effects.has(id))
    if (stillThere.length) throw err
  }
}

/**
 * Reconcile ONE managed effect of a given kind onto an actor.
 *
 * Why this is not just `actor.effects.find(...)` plus create-or-update: two concurrent syncs
 * can both find nothing and both create, leaving a duplicate. That was reproduced live — an
 * explicit `syncManagedEffects()` racing the `updateActor` hook produced two of each effect —
 * and it does NOT heal on its own, because `find()` returns the first, updates it, and leaves
 * the other behind.
 *
 * The consequence differs by change type, which is the trap: a duplicated `override` (the
 * fumble die) is harmless because both write the same value, but a duplicated `add` (the AC
 * bonus) STACKS, so the character silently carries +1 AC too much, permanently.
 *
 * So: gather ALL effects of this kind, keep the first, delete the rest, then update or create.
 * That makes the function idempotent under races and self-healing for any world that already
 * has duplicates.
 *
 * @param {Actor} actor
 * @param {string} kind - the `flags.wfvtt.managed` value
 * @param {object|null} spec - `{name, img, change}`, or null to remove the effect entirely
 * @returns {Promise<'created'|'updated'|'removed'|'unchanged'|'deduplicated'>}
 */
async function reconcileManagedEffect (actor, kind, spec) {
  const managed = actor.effects.filter(e => e.getFlag(MODULE_ID, 'managed') === kind)
  const [keep, ...duplicates] = managed

  let deduplicated = false
  if (duplicates.length) {
    await deleteEffects(actor, duplicates.map(e => e.id))
    deduplicated = true
  }

  if (!spec) {
    if (keep) {
      await deleteEffects(actor, [keep.id])
      return 'removed'
    }
    return deduplicated ? 'deduplicated' : 'unchanged'
  }

  if (!keep) {
    await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: spec.name,
      img: spec.img,
      changes: [spec.change],
      disabled: false,
      flags: { [MODULE_ID]: { managed: kind } }
    }])
    return 'created'
  }

  if (keep.changes?.[0]?.value === spec.change.value && !keep.disabled) {
    return deduplicated ? 'deduplicated' : 'unchanged'
  }
  await keep.update({ changes: [spec.change], disabled: false })
  return 'updated'
}

/**
 * The fumble die this actor should have, or null if the module should not set one.
 *
 * Two sources, because WF states the 0-level die as a rule rather than as a row on any class
 * chart: Frontier Folk get a flat `1d14` (`Weird_Frontiers_V6.md:616`), and every class reads
 * its die off the generated progression chart.
 *
 * The Frontier Folk die is gated on level 0 specifically, not merely on the sheet. The rule is
 * about *zero-level characters*, so a character left on that sheet after gaining a level gets
 * no managed die rather than a wrong one — the same reason the class path returns null for a
 * level the chart does not cover.
 *
 * @param {Actor} actor
 * @returns {string|null}
 */
function fumbleDieForActor (actor) {
  const classId = classIdOf(actor)
  const level = Number(actor.system?.details?.level?.value) || 0
  if (classId === ZERO_LEVEL_CLASS_ID) return level === 0 ? ZERO_LEVEL_FUMBLE_DIE : null
  return fumbleDieFor(classId, level)
}

/**
 * Create, update or remove the managed fumble-die effect so it matches the character's current
 * class and level. Safe to call repeatedly: it writes only when the value actually differs.
 *
 * @param {Actor} actor
 * @returns {Promise<'created'|'updated'|'removed'|'unchanged'|'skipped'>}
 */
async function applyFumbleDie (actor) {
  if (actor?.type !== 'Player') return 'skipped'

  const die = fumbleDieForActor(actor)

  // Not a WF character at all, or a level the chart does not cover (a plain DCC 0-level
  // character, or past 10th): remove the effect rather than leaving a stale die in place.
  if (!die) return reconcileManagedEffect(actor, 'fumbleDie', null)

  return reconcileManagedEffect(actor, 'fumbleDie', {
    name: EFFECT_NAME,
    img: 'icons/svg/downgrade.svg',
    // v14 takes a STRING `type`, not a numeric `mode`. Tested in-world, because the obvious
    // constant is a trap: CONST.ACTIVE_EFFECT_CHANGE_TYPES is a map of type name -> default
    // PRIORITY with lowercase keys, so `.OVERRIDE` is undefined and `mode: 50` does nothing.
    // An effect built that way falls back to ADD, which on a die string walks it one step up
    // the dice chain — 1d4 became 1d5 at every level.
    change: { key: KEY, type: 'override', value: die, priority: 20 }
  })
}

/**
 * Create, update or remove the managed AC-bonus effect.
 *
 * `Weird_Frontiers_V6.md:2852`: "Unarmored characters begin the game with an armor class of
 * 10 + any Agility modifier… Each time a character increases in level, they gain a cumulative
 * +1 bonus to their AC (a character reaching 3rd level would gain a +3 AC)." So the bonus
 * equals the character's level.
 *
 * It is applied to `ac.otherMod`, NOT `ac.value`. DCC computes
 * `ac.value = 10 + abilityMod + armorBonus + acOtherMod` inside prepareDerivedData
 * (`reference/dcc/module/actor.js:243`), which runs AFTER effects — so an effect on `ac.value`
 * is silently overwritten (verified: it changed nothing). The same computation READS
 * `ac.otherMod`, which effects have already modified, so adding there flows through DCC's own
 * formula. It also stacks with, rather than replaces, whatever the player has typed into their
 * own "other modifier" field — which WF needs, since AC is "further modified by spells, lucky
 * rolls, miracles, contraptions, and mundane items" (`:2852`).
 *
 * Only applied to a character of a WF class. A plain DCC character in a shared world must not
 * quietly gain AC per level.
 *
 * @param {Actor} actor
 * @returns {Promise<'created'|'updated'|'removed'|'unchanged'|'skipped'>}
 */
async function applyAcBonus (actor) {
  if (actor?.type !== 'Player') return 'skipped'

  const isWFClass = Object.hasOwn(WF_CLASS_REGISTRY, classIdOf(actor))
  const level = Number(actor.system?.details?.level?.value) || 0
  // A 0-level funnel character has not increased in level yet, so gains nothing.
  const bonus = isWFClass && level > 0 ? level : 0

  if (!bonus) return reconcileManagedEffect(actor, 'acBonus', null)

  return reconcileManagedEffect(actor, 'acBonus', {
    name: AC_EFFECT_NAME,
    img: 'icons/svg/shield.svg',
    // `add`, and on otherMod rather than value — see the docblock above. Note a duplicated
    // `add` effect stacks, which is exactly why reconcileManagedEffect deduplicates.
    change: { key: AC_KEY, type: 'add', value: String(bonus), priority: 20 }
  })
}

/**
 * Sync every managed effect on an actor. The single entry point the hooks call.
 *
 * @param {Actor} actor
 * @returns {Promise<{fumbleDie: string, acBonus: string}>}
 */
export async function syncManagedEffects (actor) {
  if (actor?.type !== 'Player') return { fumbleDie: 'skipped', acBonus: 'skipped' }
  return serialize(actor, async () => ({
    fumbleDie: await applyFumbleDie(actor),
    acBonus: await applyAcBonus(actor)
  }))
}

/**
 * Serialized single-effect entry points.
 *
 * They wrap the `apply*` internals rather than calling each other, because `serialize` is
 * keyed per actor and is NOT re-entrant: a serialized function awaiting another serialized
 * call on the same actor would queue behind itself and never resolve.
 *
 * @param {Actor} actor
 * @returns {Promise<'created'|'updated'|'removed'|'unchanged'|'deduplicated'|'skipped'>}
 */
export async function syncFumbleDie (actor) {
  if (actor?.type !== 'Player') return 'skipped'
  return serialize(actor, () => applyFumbleDie(actor))
}

/** As `syncFumbleDie`, for the AC bonus. @param {Actor} actor */
export async function syncAcBonus (actor) {
  if (actor?.type !== 'Player') return 'skipped'
  return serialize(actor, () => applyAcBonus(actor))
}

/**
 * Wire the sync to the events that can change the answer.
 *
 * On `updateActor` rather than on render: a render-time write is a side effect in a place that
 * should have none, and would fire on every redraw for every observer. The GM guard means one
 * client does the write instead of every connected client racing to do the same one.
 */
export function registerManagedEffectSync () {
  // A hook handler is fire-and-forget: nothing awaits it, so a rejection becomes an unhandled
  // promise rejection that Foundry never surfaces. That is not hypothetical here — a throw
  // from a concurrent delete left a 0-level character carrying a stale AC bonus, with no error
  // anywhere. Log it instead, and let the next sync try again.
  const guarded = async (actor) => {
    try {
      return await syncManagedEffects(actor)
    } catch (err) {
      console.error(`${MODULE_ID} | failed to sync managed effects on ${actor?.name}`, err)
    }
  }

  Hooks.on('updateActor', async (actor, changes) => {
    if (!game.user.isGM) return
    const details = changes?.system?.details
    if (details?.level?.value === undefined && details?.sheetClass === undefined) return
    await guarded(actor)
  })

  // A sheet that has just written its class defaults for the first time needs the same sync,
  // and that path does not always go through updateActor with a details diff.
  Hooks.on('createActor', async (actor) => {
    if (!game.user.isGM) return
    await guarded(actor)
  })

  // Exposed so a GM can repair a world in bulk from the console after an upgrade:
  //   game.modules.get('wfvtt').api.syncAllManagedEffects()
  const module = game.modules.get(MODULE_ID)
  if (module) {
    module.api = module.api ?? {}
    module.api.syncFumbleDie = syncFumbleDie
    module.api.syncAcBonus = syncAcBonus
    module.api.syncManagedEffects = syncManagedEffects
    module.api.syncAllManagedEffects = async () => {
      const results = {}
      for (const actor of game.actors) {
        const outcome = await syncManagedEffects(actor)
        for (const [what, result] of Object.entries(outcome)) {
          results[what] = results[what] ?? {}
          results[what][result] = (results[what][result] ?? 0) + 1
        }
      }
      return results
    }
  }
}
