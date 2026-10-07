/**
 * Weird Frontiers actor sheets — one per class, built from the generated registry.
 *
 * Each class sheet is a stub: DCCSheet resolves CLASS_PARTS / CLASS_TABS from
 * CONFIG.DCC.sheetParts[CLASS_ID] through inherited static getters, and runs the first-open
 * applyClassDefaults / applyClassStartingItems pass itself. Since the only thing that differs
 * between them is CLASS_ID, the thirteen classes are produced by a factory rather than thirteen
 * near-identical files.
 *
 * The import is Foundry-absolute rather than a relative walk out of modules/ into systems/ — it
 * is depth-independent and is what XCC uses. standard's import plugin objects to absolute paths;
 * Foundry resolves them at runtime, so the rule is disabled here exactly as XCC disables it.
 */
/* eslint-disable-next-line import/no-absolute-path */
import { DCCSheet } from '/systems/dcc/module/actor-sheets-dcc.js'
import { WFSheetMixin } from './wf-sheet.mjs'
import { WF_CLASS_REGISTRY } from './wf-class-registry.mjs'
import { ZERO_LEVEL_CLASS_ID } from './wf-zero-level.mjs'

/** DCC's shared sheet plus the WF display context (Path track, Grit maximum). */
const WFSheet = WFSheetMixin(DCCSheet)

/**
 * One sheet class per WF class.
 *
 * The named function expression gives each a real constructor name in the Foundry sheet picker
 * and in error traces — an anonymous `class extends` would show every one of them as the same
 * unhelpful label.
 *
 * @type {Record<string, typeof WFSheet>}
 */
export const WF_SHEET_CLASSES = Object.fromEntries(
  Object.entries(WF_CLASS_REGISTRY).map(([classId, entry]) => {
    const name = `ActorSheet${entry.sheetClass.replace(/-/g, '')}`
    const SheetClass = { [name]: class extends WFSheet {} }[name]
    SheetClass.DEFAULT_OPTIONS = { position: { height: 640 } }
    SheetClass.CLASS_ID = classId
    return [classId, SheetClass]
  })
)

/**
 * The zero-level sheet. Same shape as a class sheet — DCCSheet resolves its parts from
 * CONFIG.DCC.sheetParts[CLASS_ID] and runs applyClassDefaults on first open — but it is built
 * separately because it is not in the generated class registry and never will be: Frontier Folk
 * is the absence of a class, not another one. Choosing this sheet is what marks a character as
 * WF rather than plain DCC at 0 level; see module/wf-zero-level.mjs.
 */
export const WFZeroLevelSheet = { ActorSheetFrontierFolk: class extends WFSheet {} }.ActorSheetFrontierFolk
WFZeroLevelSheet.DEFAULT_OPTIONS = { position: { height: 640 } }
WFZeroLevelSheet.CLASS_ID = ZERO_LEVEL_CLASS_ID
