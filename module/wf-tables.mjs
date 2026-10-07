/* global Hooks, game, CONFIG */
/**
 * Registers the Weird Frontiers critical-hit and fumble charts (REQ-SHEET-015).
 *
 * CRIT TABLES NEED NO PER-WEAPON WORK. DCC resolves one by PREFIX: it builds
 * `'Crit Table ' + suffix` and walks every registered pack for a table whose name starts with it
 * (`reference/dcc/module/utilities.js:294,327`). The suffix is the weapon's
 * `system.config.critTableOverride`, falling back to the actor's `attributes.critical.table`
 * (`item.js:270`). Our tables are named `Crit Table Blunt`, `… Piercing`, `… Slashing`,
 * `… Firearms`, `… Wrestling`, which is exactly the vocabulary WF uses for damage types
 * (`Weird_Frontiers_V6.md:2870`) and which REQ-SHEET-022 already writes onto a WF NPC. DCC's own
 * tables are `Crit Table I…V`, `M`, `U`, `G`, `DR`, `DN`, so neither prefix can catch the other.
 *
 * FUMBLE TABLES CANNOT BE SELECTED PER ATTACK, AND THAT IS A PLATFORM LIMIT, NOT AN OVERSIGHT.
 * `CONFIG.DCC.fumbleTable` is a single global name (`config.js:433`, read at
 * `utilities.js:443`), and the weapon schema has no fumble-table override to match
 * `critTableOverride`. WF has three charts — Melee, Ranged, Firearms (`:2882`) — so only one can
 * be live for automated rolls. `dcc.rollWeaponAttack` is documented as a stable hook but is not
 * emitted anywhere in 0.70.50, so it cannot be used to swap the global just in time.
 *
 * Rather than silently pick one, this exposes a world setting. All three ship in the pack and a
 * judge can roll the other two by hand. Lifting this needs an upstream change:
 * a per-weapon fumble override, or a fumble-table registry keyed like `criticalHitPacks`.
 */
const MODULE_ID = 'wfvtt'
const PACK = `${MODULE_ID}.wf-crit-tables`

/** Setting value -> the table name inside the pack. `dcc` means "do not touch the system's". */
const FUMBLE_TABLES = {
  melee: 'Fumble Table Melee',
  ranged: 'Fumble Table Ranged',
  firearms: 'Fumble Table Firearms'
}

/** The full `module.pack.TableName` path DCC expects in `CONFIG.DCC.fumbleTable`. */
const fumblePathFor = (choice) => `${PACK}.${FUMBLE_TABLES[choice] ?? FUMBLE_TABLES.melee}`

/**
 * Point DCC at the chosen WF fumble chart.
 *
 * ASSIGNED DIRECTLY, NOT THROUGH THE HOOK, AND THAT IS DELIBERATE. `dcc.setFumbleTable`'s handler
 * only overwrites an existing value when the call says it came from a system setting
 * (`reference/dcc/module/settings-table-hooks.mjs`), which is right — a content pack should not
 * stomp whatever the world already has. But `dcc-core-book` loads before this module
 * alphabetically and sets its own `Table 4-2: Fumbles` first, so the hook silently drops ours.
 * Verified live: the hook fired, our pack registered, and the fumble table stayed DCC's.
 *
 * Claiming `fromSystemSetting = true` would be a lie about where the value came from. So the
 * hook is still called — so any other listener sees the announcement — and then the value is
 * set directly, because the GM's choice for THIS world is expressed in the setting below.
 *
 * `dcc` leaves the system's table alone, which is the right answer for a world running plain DCC
 * characters alongside WF ones: `CONFIG.DCC.fumbleTable` is global, so whichever chart is
 * selected applies to every PLAYER CHARACTER in the world, WF or not.
 *
 * IT DOES NOT REACH NPCs AT ALL, and that is a hard platform limit rather than a setting. An NPC
 * fumble never consults `CONFIG.DCC.fumbleTable`: DCC derives the table name from the NPC's CRIT
 * table via `getFumbleTableNameFromCritTableName` (`utilities.js:467`), which returns
 * `` `Fumble Table ${critTableName}` `` — so a WF creature, whose crit table REQ-SHEET-022 sets to
 * Blunt / Piercing / Slashing, sends DCC looking for "Fumble Table Blunt". Then
 * `getNPCFumbleTableResult` (`utilities.js:487`) searches exactly two places: the hardcoded
 * `dcc-core-book.dcc-monster-fumble-tables` pack, and the world's own tables. A module compendium
 * is never consulted, so there is no name this module could choose that would be found.
 *
 * The consequence to be honest about: **WF NPC fumbles are not automated.** They are rolled by
 * hand from the compendium. Lifting it needs either an upstream change (search the registered
 * crit-hit packs for fumble tables too, as the PC path already does) or a GM-invoked importer
 * that copies the three charts into world tables under the names DCC derives — which mutates the
 * world and so is not something this module should do behind a GM's back.
 * The setting hint must not claim this covers every actor, because it does not.
 */
function applyFumbleTable (choice) {
  if (choice === 'dcc') return
  const path = fumblePathFor(choice)
  Hooks.callAll('dcc.setFumbleTable', path, false)
  CONFIG.DCC.fumbleTable = path
}

export function registerWeirdFrontiersTables () {
  game.settings.register(MODULE_ID, 'fumbleTable', {
    name: 'WF.Settings.FumbleTable',
    hint: 'WF.Settings.FumbleTableHint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      melee: 'WF.Settings.FumbleMelee',
      ranged: 'WF.Settings.FumbleRanged',
      firearms: 'WF.Settings.FumbleFirearms',
      dcc: 'WF.Settings.FumbleDcc'
    },
    default: 'melee',
    // A reload is required because the 'dcc' choice cannot be applied in-session: it means "put
    // nothing of ours in `CONFIG.DCC.fumbleTable`", and the value the system started with has
    // already been overwritten by then. Switching away from a WF chart therefore only takes
    // effect on a fresh load, and Foundry should say so rather than appear to accept it.
    requiresReload: true,
    onChange: applyFumbleTable
  })

  // `dcc.ready` is the hand-off boundary for content packs — the system's own doc calls it that
  // (`docs/dev/EXTENSION_API.md`), and registering earlier races the table cache
  // (`module/table-loading.mjs:176`).
  Hooks.once('dcc.ready', () => {
    // The second argument is `fromSystemSetting`. Passing false is deliberate: the handler only
    // overwrites an existing value when it is true (`settings-table-hooks.mjs`), so a GM who has
    // pointed the world at their own tables is not stomped by this module loading.
    Hooks.callAll('dcc.registerCriticalHitsPack', PACK, false)
    applyFumbleTable(game.settings.get(MODULE_ID, 'fumbleTable'))
  })
}
