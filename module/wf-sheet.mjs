/**
 * Shared Weird Frontiers sheet behaviour, mixed into each class sheet.
 *
 * Everything here is DERIVED FOR DISPLAY. The DCC system exposes no hook during prepareData
 * (only `dcc.defineBaseActorSchema` and `dcc.definePlayerSchema` exist), so a value that is a
 * function of other fields — the Grit maximum, the Path's label and modifier — is computed at
 * render rather than stored. That avoids a stored copy going stale when an ability changes,
 * and it avoids monkey-patching the actor's data model.
 */

import { FIREARM_FLAG, MODULE_ID } from './wf-firearm.mjs'

/** Printed order of the Path track, left (Damned) to right (Righteous). */
const PATH_POSITIONS = [-4, -3, -2, -1, 0, 1, 2, 3, 4]

/**
 * The printed SIGNATURE WEAPONS block is five ruled rows (`docs/official-sheet-field-map.md`).
 * Kept as a number because it is a property of the PAPER form, not a limit on the character.
 */
const SIGNATURE_ROWS = 5

/**
 * REQ-SHEET-011 — SIGNATURE WEAPONS, five rows of `WEAPON | DMG | SHOTS | RANGE`.
 *
 * DERIVED from the actor's weapon items, not stored as five sets of free-text fields, and that
 * is the whole design decision. On paper those twenty widgets are the only place the numbers can
 * live. Here every one of them already exists on the weapon: the name, DCC's `system.damage` and
 * `system.range`, and a firearm's capacity. Typing them again would create a second source of
 * truth for damage that silently drifts the moment the item is edited — the same failure the
 * Dinero field was fixed for, and the reason GOODS & SUNDIRES has no free-text twin.
 *
 * A weapon is signature when `flags.wfvtt.signature` is set. The checkbox in the weapons list
 * writes it through DCC's own `items.<id>.…` form path, which `_processFormData` turns into an
 * `updateEmbeddedDocuments('Item', …)` call (`reference/dcc/module/actor-sheet.js:932-957`), so
 * this needs no action handler of its own.
 *
 * Nothing is truncated to five. The paper form ran out of rows; the data has not. If more than
 * five are marked the sheet says so rather than hiding one.
 *
 * @param {Actor} actor
 * @returns {{id: string, name: string, dmg: string, shots: string, range: string}[]}
 */
function signatureWeapons (actor) {
  const weapons = actor?.itemTypes?.weapon ?? []
  return weapons
    .filter(w => w.getFlag(MODULE_ID, 'signature'))
    .map(w => {
      const gun = w.getFlag(MODULE_ID, FIREARM_FLAG) ?? {}
      return {
        id: w.id,
        name: w.name,
        // A firearm's damage is BANDED — "d14/d10/d7" for short/medium/long — and lives on the
        // flag, because DCC's `system.damage` is a single formula it rolls directly. Prefer the
        // banded string when there is one; fall back to the plain formula for melee.
        dmg: gun.bandedDamage || w.system?.damage || '',
        // SHOTS is the gun's capacity (`load`). Melee weapons have none, and an empty cell is
        // the honest answer — the printed sheet leaves it blank too.
        shots: gun.load || '',
        range: w.system?.range || ''
      }
    })
}

/**
 * The label under each notch on the printed track:
 * `+1d · +3 · +2 · +1 · THE LINE · +1 · +2 · +3 · +1d` (`CharacterSheet_FF.md:17-19`).
 * At the extremes the bonus is a die step up the dice chain, not a flat modifier.
 */
function pathModifier (position) {
  const magnitude = Math.abs(position)
  if (magnitude === 0) return ''
  if (magnitude === 4) return '+1d'
  return `+${magnitude}`
}

/** Sign selects the Path; 0 is Walking the Line. */
function pathStateKey (position) {
  if (position < 0) return 'Damned'
  if (position > 0) return 'Righteous'
  return 'TheLine'
}

/**
 * The Walking-the-Line bonus for a number of levels held at the Line (REQ-SHEET-001a).
 *
 * `Weird_Frontiers_V6.md:950`: "+1 modifier at first-level ... They progress with this bonus for
 * each level they can maintain the Line (+2 at the next level, +3 at the level after, and +1d
 * caps the bonus)."
 *
 * Deliberately the SAME shape as `pathModifier` — +1..+3 then +1d — but driven by a different
 * number. The track's modifier comes from how far along a Path you are; this comes from how long
 * you have stood still.
 */
function lineBonus (levels) {
  if (levels <= 0) return ''
  if (levels >= 4) return '+1d'
  return `+${levels}`
}

/**
 * @param {typeof foundry.applications.api.DocumentSheetV2} Base
 * @returns {typeof foundry.applications.api.DocumentSheetV2}
 */
export const WFSheetMixin = (Base) => class extends Base {
  /**
   * Relabel the equipment sub-tab from "Weapons & Armor" to just "Weapons".
   *
   * WF has no armor at all (REQ-SHEET-014), and the WF equipment template drops the armor
   * section, so upstream's `DCC.WeaponsAndArmor` label would advertise a section that is not
   * there. Only that one label changes: the rest of `TABS` is copied from the base class so
   * this does not quietly freeze a snapshot of upstream's tab structure.
   */
  static get TABS () {
    const base = super.TABS ?? {}
    const equipment = base.equipment
    if (!equipment) return base
    return {
      ...base,
      equipment: {
        ...equipment,
        tabs: equipment.tabs.map(tab =>
          tab.id === 'weapons' ? { ...tab, label: 'WF.Equipment.Weapons' } : tab)
      }
    }
  }

  async _prepareContext (options) {
    const context = await super._prepareContext(options)
    const system = this.options.document.system

    const position = system.details?.path?.position ?? 0

    // REQ-SHEET-001a. Two things make the Line different from the two Paths, and the sheet has
    // to show both or the number is misleading:
    //
    //  - the bonus is driven by a SEPARATE counter (levels held at the Line), not by the track;
    //  - it "applies when dealing with folks of ANY Path" (`:950`), where the Righteous and
    //    Damned modifiers are audience-scoped — PoR "when dealing with common townsfolk and
    //    lawmen", PoD "when dealing with the seedier elements of a town, including criminals"
    //    (`:946`, `:948`).
    //
    // Straying LOSES the bonus — it is not paused. "They progress with this bonus for each level
    // they can MAINTAIN the Line … If at any point they stray from WtL, they lose this bonus and
    // instead take the bonus from the Path they now follow" (`:950`). "Maintain" makes it an
    // unbroken streak, so a character who strays and later returns starts again at +1 rather
    // than resuming where they left off. Straying LOSES the bonus; it does not suspend it.
    //
    // The stored counter is still not wiped automatically: silently destroying a number the user
    // typed, because a track radio was nudged, is worse than prompting them to clear it. So the
    // sheet derives `lost` and tells them to reset it — the rule is expressed in the UI text, not
    // enforced by deleting data.

    // Grit's cap is the character's STORED starting total, not a recomputation. See the long
    // comment in wf-schema.mjs: deriving it from the current scores would shrink the pool every
    // time a class spent temporary Personality.
    //
    // The base `.value` is used ONLY to offer a creation-time suggestion — deliberately not
    // `effectiveValue`, so an Active Effect on an ability cannot move the suggested cap either.
    const baseScore = (key) => system.abilities?.[key]?.value ?? 0
    const suggestedTotal = Math.floor((baseScore('sta') + baseScore('per')) / 2)

    const grit = system.attributes?.grit ?? {}
    const startingTotal = grit.startingTotal ?? 0
    const gritMax = Math.max(0, startingTotal - (grit.permanentLoss ?? 0))

    // Each Hex is the same number expressed four ways (`Weird_Frontiers_V6.md:3211`). None of
    // it is automated, so the sheet shows the numbers the player actually has to apply.
    const lineLevels = system.details?.path?.lineLevels ?? 0
    const hexes = system.attributes?.hexes ?? 0
    const boons = system.attributes?.boons ?? 0

    context.wf = {
      path: {
        position,
        stateKey: `WF.Path.${pathStateKey(position)}`,
        modifier: pathModifier(position),
        line: {
          levels: lineLevels,
          bonus: lineBonus(lineLevels),
          atTheLine: position === 0,
          // Shown only when there is something to show: a bonus being earned, or a broken
          // streak the user needs to clear.
          active: position === 0 && lineLevels > 0,
          lost: position !== 0 && lineLevels > 0
        },
        track: PATH_POSITIONS.map(p => ({
          position: p,
          modifier: pathModifier(p),
          checked: p === position,
          isLine: p === 0,
          stateKey: `WF.Path.${pathStateKey(p)}`
        }))
      },
      tokens: {
        boons,
        hexes,
        // Shown only when they bite, so a character with no Hexes sees no penalties.
        hasHexes: hexes > 0,
        fumblePenalty: `+${hexes}d`,
        interactionPenalty: `-${hexes}d`,
        gritDcModifier: `+${hexes}`,
        madnessModifier: `+${hexes * 10}%`
      },
      signature: (() => {
        const rows = signatureWeapons(this.options.document)
        return {
          rows,
          none: rows.length === 0,
          printedRows: SIGNATURE_ROWS,
          // How many more are marked than the paper form has room for. Shown as a note, not
          // used to drop rows.
          overflow: Math.max(0, rows.length - SIGNATURE_ROWS)
        }
      })(),
      grit: {
        max: gritMax,
        startingTotal,
        suggestedTotal,
        // True before the starting total has ever been set, so the sheet can prompt for it
        // rather than silently showing a cap of 0.
        needsSetup: startingTotal === 0 && suggestedTotal > 0,
        // Retirement is a permanent maximum of 0 (`Weird_Frontiers_V6.md:3251`) — distinct from
        // a character who simply has not filled the field in yet.
        retired: startingTotal > 0 && gritMax === 0
      }
    }
    return context
  }
}
