/**
 * Weird Frontiers zero-level ("Frontier Folk") characters — REQ-SHEET-013a.
 *
 * `Weird_Frontiers_V6.md:616`: "**Zero-level characters** use a d14 as their fumble die and a
 * d6 as their critical hit die. The high starting fumble die reflects a typical townie suddenly
 * thrown into a supernatural landscape filled with violence."
 *
 * THE PROBLEM THIS SOLVES IS IDENTIFICATION, NOT MECHANISM. A 0-level character has no class,
 * so it has no WF `sheetClass` either, and DCC's own zero-level sheet stamps every one of them
 * `Generic` (`reference/dcc/module/actor-sheets-dcc.js:206-209`). A WF funnel character and a
 * plain DCC funnel character are therefore indistinguishable, and applying `1d14` to every
 * 0-level actor would corrupt plain DCC characters in a world where this module is enabled.
 *
 * The module already answers exactly this question thirteen times over: a character is a WF
 * character because a WF sheet was chosen for it. So Frontier Folk is registered as a
 * fourteenth, class-less entry — the GM picks "Frontier Folk" as the sheet, that writes
 * `sheetClass = 'Frontier-Folk'`, and everything downstream keys off it per-actor. A world
 * running WF and DCC characters side by side therefore still works, which a world-level
 * `dcc.activeVariant` check could not have managed.
 *
 * It is deliberately NOT registered for progression load: there is no `frontier-folk-N` level
 * data, because 0-level characters have no progression. They gain one by becoming a class.
 */
import { commonParts, trackDefaults } from './wf-class-data.mjs'

/** classId, and the capitalised sentinel written to `system.details.sheetClass`. */
export const ZERO_LEVEL_CLASS_ID = 'frontier-folk'
export const ZERO_LEVEL_SHEET_CLASS = 'Frontier-Folk'

/**
 * `Weird_Frontiers_V6.md:616`. The fumble die is applied as an Active Effect rather than stored
 * — DCC recomputes `attributes.fumble.die` from equipped armor on every `prepareBaseData` and
 * WF has no armor, so a stored value is discarded. The crit die needs no such help: DCC never
 * recomputes `attributes.critical.die` at all. Both verified live — a stored `1d14` reverted to
 * `1d4` immediately, while a stored `1d6` crit die survived a bare `prepareData()` and a real
 * update.
 */
export const ZERO_LEVEL_FUMBLE_DIE = '1d14'
export const ZERO_LEVEL_CRIT_DIE = '1d6'

/**
 * WF is silent on the 0-level critical RANGE, so this falls back to DCC core, which uses 20 for
 * its own zero-level sheet (`reference/dcc/module/actor-sheets-dcc.js:210`) and as the default
 * for every built-in class (`built-in-class-defaults.mjs`).
 */
export const ZERO_LEVEL_CRIT_RANGE = 20

/**
 * Written by `applyClassDefaults` when the sheet is first opened.
 *
 * The cleared track fields are not redundant. Class mixins contribute to one shared Player
 * schema, so a character that previously used a class sheet still carries that class's Mojo or
 * Chi track; without an explicit clear, a Gunslinger demoted to Frontier Folk would keep its
 * Deadeye track on the sheet.
 */
const defaults = {
  sheetClass: ZERO_LEVEL_SHEET_CLASS,
  localize: { 'class.className': 'WF.ZeroLevel.Name' },
  literal: {
    'attributes.critical.die': ZERO_LEVEL_CRIT_DIE,
    'details.critRange': ZERO_LEVEL_CRIT_RANGE,
    'config.showSkills': true,
    'config.showSpells': false,
    ...trackDefaults({})
  }
}

/**
 * The WF common part only — Path, Grit, Dinero and the fumble die, which is the whole of what a
 * funnel character has. No class tab, because there is no class.
 */
const sheetPart = {
  parts: commonParts(),
  tabs: {}
}

/**
 * Register Frontier Folk. No `registerClassMixin` — the schema fields it uses are already
 * declared by the thirteen class mixins on the shared Player schema — and no
 * `registerHomebrewClassForProgressionLoad`, per the note above.
 *
 * @param {object} api - `game.dcc`
 */
export function registerZeroLevel (api) {
  api.registerClassDefaults(ZERO_LEVEL_CLASS_ID, defaults)
  api.registerSheetPart(ZERO_LEVEL_CLASS_ID, sheetPart)
}
