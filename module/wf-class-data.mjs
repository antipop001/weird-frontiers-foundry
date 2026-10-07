/* global foundry */
/**
 * Registers every Weird Frontiers class against the DCC extension API.
 *
 * All thirteen classes are built from `WF_CLASS_REGISTRY`, which is GENERATED from the same
 * progression charts the ratchet verifies against the books. Adding a class is therefore a data
 * change — drop a chart in `data/classes/`, run `npm run levels` — not a code change. Writing
 * thirteen bespoke descriptors by hand would have meant thirteen more places for a number to
 * drift out from under `tools/build_class_charts.py --check`.
 *
 * Numeric progression does NOT live here: it lives in the `wf-class-level-data` compendium.
 * Only 1st-level starting values appear, because `registerClassDefaults` needs something to
 * write when a sheet is first opened; everything after that comes from the level-up dialog.
 */
import { WF_CLASS_REGISTRY } from './wf-class-registry.mjs'

const MODULE_ID = 'wfvtt'

const classPartial = (name) => `modules/${MODULE_ID}/templates/actor-partial-${name}.html`

/**
 * The base parts every WF class tab sits alongside.
 *
 * `character` points at OUR partial, not DCC's: that one part carries the Path track, Grit and
 * Dinero, so re-pointing it here re-skins every WF class at once (REQ-SHEET-010). It is a
 * generated fork of the DCC template — regenerate with tools/build_wf_common.py, never by hand.
 *
 * `equipment` is OURS too, and for the same reason: DCC's equipment tab pulls its sub-partials
 * in by hard-coded path, so dropping the armor section (REQ-SHEET-014) and swapping the five
 * coin fields for Dinero (REQ-SHEET-004) meant forking that chain as well. Both forks are
 * generated — regenerate with tools/build_wf_equipment.py, never by hand.
 *
 * Exported because the zero-level Frontier Folk entry needs exactly the same two parts; a
 * second copy there would be one more place for these paths to drift.
 */
export const commonParts = () => ({
  character: { id: 'character', template: `modules/${MODULE_ID}/templates/actor-partial-wf-common.html` },
  equipment: { id: 'equipment', template: `modules/${MODULE_ID}/templates/actor-partial-wf-equipment.html` }
})

/**
 * The schema mixin. Declares all three track groups for every class.
 *
 * Mixins contribute to the SAME shared Player schema, so a field declared by one class exists
 * on every Player regardless. Declaring them per-class therefore bought nothing and made the
 * initial values depend on mixin order (which is sorted by classId): a Bedlamite opened showing
 * the Mystic Monk's Chi Die. The fields are declared unconditionally and left empty; which ones
 * a given character actually has is decided by `trackDefaults` below.
 *
 * The signature die sits under `skills` rather than `class` so it inherits DCC's rollable-skill
 * wiring (`data-action="rollSkillCheck"`), the same way dcc-crawl-classes carries the bard's
 * Talent die.
 *
 * Build fresh field instances on every call — Foundry may re-invoke defineSchema(), and sharing
 * field objects between schemas corrupts state.
 */
const mixin = function (schema) {
  const { SchemaField, StringField } = foundry.data.fields
  const track = () => new SchemaField({
    label: new StringField({ initial: '' }),
    die: new StringField({ initial: '' }),
    value: new StringField({ initial: '' })
  })
  schema.skills.fields.wfClassDie = track()
  schema.class.fields.wfPercentTrack = track()
  schema.class.fields.wfSecondaryTrack = track()
}

/**
 * Class-specific starting values, written by applyClassDefaults on first sheet open.
 *
 * ALWAYS writes all three groups, CLEARING the ones this class does not have — that is what
 * makes an absent track actually absent on a shared schema. The sheet template keys visibility
 * on the label being non-empty, never on the field existing.
 *
 * Exported because the zero-level entry needs the same clearing behaviour: `trackDefaults({})`
 * empties all three groups, so a character moved onto the Frontier Folk sheet does not keep the
 * class track it had before.
 */
export const trackDefaults = (entry) => ({
  'skills.wfClassDie.label': entry.classDieLabel ?? '',
  'skills.wfClassDie.die': entry.classDieLabel ? entry.classDie : '',
  'class.wfPercentTrack.label': entry.percentTrackLabel ?? '',
  'class.wfPercentTrack.value': entry.percentTrackLabel ? entry.percentTrack : '',
  'class.wfSecondaryTrack.label': entry.secondaryTrackLabel ?? '',
  'class.wfSecondaryTrack.value': entry.secondaryTrackLabel ? entry.secondaryTrack : ''
})

const defaultsFor = (classId, entry) => ({
  // Capitalised sentinel written to system.details.sheetClass. applyClassDefaults dispatches on
  // exact string equality with this; a mismatch re-runs the first-open block on every render.
  sheetClass: entry.sheetClass,
  localize: { 'class.className': `WF.Class.${classId}.Name` },
  literal: {
    'attributes.hitDice.value': entry.hitDie,
    'attributes.critical.die': entry.critDie,
    'details.critRange': entry.critRange,
    'config.showSkills': true,
    // No DCC-style spellcasting on any WF class: the five arcane systems are class abilities,
    // resolved by their own checks (Weird_Frontiers_V6.md:3612-3630), not by DCC's spell list.
    'config.showSpells': false,
    ...trackDefaults(entry)
  }
})

const sheetPartFor = (classId) => ({
  parts: {
    ...commonParts(),
    wfClass: { id: 'wfClass', template: classPartial('wf-class') }
  },
  tabs: { sheet: { tabs: [{ id: 'wfClass', group: 'sheet', label: `WF.Class.${classId}.Name` }] } }
})

export const WF_CLASSES = Object.fromEntries(
  Object.entries(WF_CLASS_REGISTRY).map(([classId, entry]) => [classId, {
    label: `WF.Class.${classId}.Name`,
    mixin,
    defaults: defaultsFor(classId, entry),
    sheetPart: sheetPartFor(classId)
  }])
)

/**
 * Register every WF class against the DCC extension API.
 *
 * Must run at `init`: mixins have to land before the Player schema is first constructed, and
 * the progression loader runs at `ready` — before `dcc.ready` fires.
 *
 * @param {object} api - `game.dcc`
 */
export function registerWeirdFrontiersClasses (api) {
  for (const [classId, def] of Object.entries(WF_CLASSES)) {
    api.registerClassMixin(classId, def.mixin)
    api.registerClassDefaults(classId, def.defaults)
    api.registerSheetPart(classId, def.sheetPart)
    // Ties the classId to the `{prefix}-{level}` item names in the level-data pack.
    api.registerHomebrewClassForProgressionLoad(classId, classId)
  }
}
