/* global Hooks, game, foundry */
/**
 * Weird Frontiers — entry point.
 *
 * Everything registers at `init`, and the ordering reasons are not obvious:
 *
 *  - The DCC system's own `init` runs before any module's, so `game.dcc` is already
 *    populated here.
 *  - Class mixins must land before the Player schema is first constructed.
 *  - `dcc.registerLevelDataPack` must fire at `init`: the progression loader runs during
 *    `ready`, BEFORE `dcc.ready`. Registering later still satisfies the level-up dialog
 *    (which reads the registry lazily) but silently misses the progression load.
 *  - Use the hook, never `CONFIG.DCC.levelDataPacks.addPack()`. The extension-API doc
 *    shows `addPack`, but `CONFIG.DCC.levelDataPacks` is null until the hook first fires,
 *    so that recipe throws on a fresh world.
 */
// Imported for side effects: registers the dcc.defineBaseActorSchema / dcc.definePlayerSchema
// listeners at module-evaluation time, which is BEFORE the system builds the schemas.
import './wf-schema.mjs'
import { registerManagedEffectSync } from './wf-effects.mjs'
import { registerWeirdFrontiersClasses } from './wf-class-data.mjs'
import { registerZeroLevel, ZERO_LEVEL_CLASS_ID } from './wf-zero-level.mjs'
import { WF_SHEET_CLASSES, WFZeroLevelSheet } from './actor-sheets-wf.js'
import { WF_CLASS_REGISTRY } from './wf-class-registry.mjs'
import { WFItemSheet } from './item-sheets-wf.js'
import { WFNPCSheet } from './wf-npc-sheet.mjs'
import { registerWeirdFrontiersTables } from './wf-tables.mjs'
import { registerCombat } from './wf-combat.mjs'
import { registerFear } from './wf-fear.mjs'
import { registerGunDeck } from './wf-gun-deck.mjs'

const MODULE_ID = 'wfvtt'

/**
 * `scope` becomes the persisted `flags.core.sheetClass` id on every actor that picks the
 * sheet. Changing one later orphans that choice for every existing character, so these
 * strings are effectively permanent.
 */
const WF_SHEETS = [
  ...Object.entries(WF_SHEET_CLASSES).map(([classId, sheet]) => ({
    sheet,
    scope: `${MODULE_ID}-${classId}`,
    label: `WF.Class.${classId}.Name`
  })),
  // Zero-level characters. Registered alongside the classes because picking this sheet is what
  // identifies a funnel character as Weird Frontiers rather than plain DCC (REQ-SHEET-013a).
  { sheet: WFZeroLevelSheet, scope: `${MODULE_ID}-${ZERO_LEVEL_CLASS_ID}`, label: 'WF.ZeroLevel.Name' }
]

Hooks.once('init', async () => {
  Hooks.callAll('dcc.registerLevelDataPack', `${MODULE_ID}.wf-class-level-data`)

  registerWeirdFrontiersClasses(game.dcc)
  registerZeroLevel(game.dcc)

  // The eight crit/fumble charts. Registered here; announced on dcc.ready (REQ-SHEET-015).
  registerWeirdFrontiersTables()

  // The Gun Deck flip and its result table (REQ-DECK-003, -004). Exposed as an API rather than
  // hooked to an attack: dcc.rollWeaponAttack is documented but never emitted in 0.70.50.
  registerGunDeck()

  // The Grit / Fear / Madness loop (specs/03-fear-madness.md). An API rather than a hook: DCC emits
  // nothing for "something frightening happened". The Fear and Madness tables are read lazily on
  // first use, since compendia are not readable this early.
  registerFear()

  // Firearm combat modifiers (specs/04-combat.md). Reported, never applied: DCC rolls its own
  // attacks and injecting a modifier would mean monkey-patching the system.
  registerCombat()

  for (const { sheet, scope, label } of WF_SHEETS) {
    // No makeDefault: these are alternate sheets. makeDefault would unregister Foundry's
    // core sheet for the whole Player subtype.
    game.dcc.registerActorSheet('Player', sheet, { scope, label })
  }

  // The WF monster stat block: AL becomes Path, and the crit/fumble dice and Grit DC are
  // derived from HD rather than stored (REQ-SHEET-020..023). No makeDefault — that would
  // unregister the core sheet for the whole NPC subtype, breaking plain DCC NPCs in a shared
  // world (reference/dcc/module/extension-api.mjs:135-141).
  game.dcc.registerActorSheet('NPC', WFNPCSheet, {
    scope: `${MODULE_ID}-npc`,
    label: 'WF.Npc.SheetLabel'
  })

  // Weapon items get a Firearm tab. No makeDefault — a world running plain DCC alongside this
  // module must keep DCC's own item sheet as its default.
  game.dcc.registerItemSheet('weapon', WFItemSheet, {
    scope: `${MODULE_ID}-weapon`,
    label: 'WF.Firearm.SheetLabel'
  })

  await foundry.applications.handlebars.loadTemplates([
    `modules/${MODULE_ID}/templates/actor-partial-wf-common.html`,
    `modules/${MODULE_ID}/templates/actor-partial-wf-class.html`,
    // Both equipment forks must be registered as partials, not just the outer one: the tab
    // includes the goods partial by path, and Handlebars resolves that at render time.
    `modules/${MODULE_ID}/templates/actor-partial-wf-equipment.html`,
    `modules/${MODULE_ID}/templates/actor-partial-wf-goods.html`,
    `modules/${MODULE_ID}/templates/actor-partial-wf-npc-common.html`,
    `modules/${MODULE_ID}/templates/item-sheet-wf-firearm.html`
  ])

  // Two values DCC would otherwise compute wrongly for WF are maintained as Active Effects:
  // the class-and-level fumble die, and the +1-per-level AC bonus. See module/wf-effects.mjs —
  // they need opposite techniques depending on which prepare phase DCC computes them in.
  registerManagedEffectSync()

  console.log(`${MODULE_ID} | Weird Frontiers registered: ` +
              `${Object.keys(WF_CLASS_REGISTRY).length} classes`)
})
