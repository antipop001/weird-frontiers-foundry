# The DCC system as a platform — engineering brief

Produced 2026-09-12 by reading the upstream clones under `reference/` (`dcc` @ 0.70.50,
`xcc`, `dcc-gongfarmers-classes`, `dcc-crawl-classes`). Every claim carries a `file:line`
into those clones so it can be re-checked when upstream moves.

`DCC` = `reference/dcc` · `XCC` = `reference/xcc` · `GF` = `reference/dcc-gongfarmers-classes`
· `CC` = `reference/dcc-crawl-classes`.

---

## 1. Module, not a system fork

`DCC/docs/user-guide/System-Vs-Module.md` does **not** answer this — it only distinguishes the
free system from the paid *content* module. The real guidance is in the extension API:

> `registerVariant` … "Variants give the system a named identity for the active set of classes
> ('dcc', 'xcc', 'mcc') so sibling content modules can ship as a Foundry module rather than
> overriding `CONFIG.Actor.documentClass` globally." — `DCC/module/extension-api.mjs:601-607`,
> echoed at `DCC/docs/dev/EXTENSION_API.md:135`

Empirical proof: **XCC is a full ruleset variant — 19 class sheets, its own parser, its own
theme, its own i18n overrides — and it is a module.** It moved *further* from forking over
time, deleting its `XCCActor` subclass and its `CONFIG.Actor.documentClass` override in favour
of the `dcc.afterComputeSpellCheck` hook (`DCC/docs/dev/EXTENSION_API.md:266-319`).

A fork would only be forced by something with no hook seam:

- a different ability set — DCC hardcodes `str/agl/sta/per/int/lck` at
  `DCC/module/data/actor/base-actor.mjs:124-131` — or different saves (`frt/ref/wil`, `:261-274`);
- new Actor/Item **subtypes** — `documentTypes` lives in `DCC/system.json:4-21` and none of the
  three example modules declares one. *(Foundry ≥ v11 does let a module add namespaced subtypes;
  unverified against this system — an open item, not a blocker.)*

Weird Frontiers keeps the six abilities, the three saves and the dice chain. → **module.**

---

## 2. Variant registration

```js
Hooks.once('init', () => {
  game.dcc.registerVariant({
    id: 'wf',
    label: 'WF.VariantWeirdFrontiers',   // i18n KEY, localized at render, never compared
    classes: ['gunslinger', 'bedlamite', 'occultist', /* … */],
    sheetTheme: 'theme-wf'               // optional CSS class
  })
})
```

Signature + validation at `DCC/module/extension-api.mjs:646-672`. `id`/`label`/`classes` are all
**required** and throw on bad input; `classes` must be a non-empty array of non-empty strings.
Duplicate `id` is last-write-wins. Stored at `CONFIG.DCC.variants[id]` (`DCC/module/config.js:516`).

Built-in seed — `DCC/module/built-in-variant.mjs:18-22`:

```js
export const BUILT_IN_VARIANT = {
  id: 'dcc',
  label: 'DCC.VariantDCC',
  classes: ['cleric', 'dwarf', 'elf', 'halfling', 'thief', 'warrior', 'wizard']
}
```

The `'dcc'` variant deliberately ships **no** `sheetTheme` — the base CSS *is* the DCC theme
(`built-in-variant.mjs:11-15`).

**What the `dcc.activeVariant` setting does.** Registered at `DCC/module/settings.js:201-210`:
world scope, `config: true`, `default: 'dcc'`, `requiresReload: true`, `choices` built by
iterating `CONFIG.DCC.variants` **at registration time** (`settings.js:197-200`).
`registerSystemSettings()` runs in the **`ready`** hook (`DCC/module/ready-hook.mjs:76`), so a
variant registered in `init` lands in the dropdown.

**What it does not do.** `getActiveVariant()` (`extension-api.mjs:696-710`) resolves the setting
to a descriptor with a `'dcc'` fallback. Its **only in-system consumer is
`applyActiveVariantSheetTheme`** (`extension-api.mjs:727-734`), called from
`DCC/module/actor-sheet.js:246` in `_onRender`. `descriptor.classes` has **zero consumers
anywhere in the system** (grep-verified). So today:

- ✅ selecting the variant adds `sheetTheme` as a CSS class to **every DCC actor sheet** — Player,
  NPC *and* Party, because it sits on the shared base's `_onRender`;
- ❌ it does **not** filter the sheet-class dropdown, hide DCC's seven classes, or gate anything
  mechanical.

**XCC does not call `registerVariant` at all** (grep of `XCC/module/` + `XCC/config.js`: zero hits
for `registerVariant`, `sheetTheme`, `activeVariant`). It scopes CSS imperatively —
`XCC/module/xcc-actor-sheet.js:832-833` does
`this.parts.tabs.parentElement.parentElement.classList.add('xcc')`, with
`XCC/styles/xcc.css:43-57` nested under `.xcc`.

> ⚠️ **`registerVariant` is "stable from day one" by declaration but has no production
> consumer.** Build on the class registries (§3), which the system dogfoods and two shipping
> modules use; treat the variant layer as cosmetic plus a settings-dropdown entry, and validate
> it live on the smoke server before designing anything around it.

---

## 3. Adding classes — the registry recipe

All helpers hang off `game.dcc` (`DCC/module/init-hook.mjs:256-266`), all are last-write-wins on
duplicate `classId`, all throw on bad args.

| Helper | Signature | Source |
|---|---|---|
| `registerClassMixin` | `(classId, mixinFn)` | `extension-api.mjs:189-202` |
| `registerClassDefaults` | `(classId, defaults)` | `extension-api.mjs:281-297` |
| `registerClassStartingItems` | `(classId, items)` | `extension-api.mjs:418-431` |
| `registerSheetPart` | `(classId, descriptor)` | `extension-api.mjs:526-539` |
| `registerHomebrewClassForProgressionLoad` | `(classId, itemPrefix)` | `extension-api.mjs:585-598` |
| `registerActorSheet` / `registerItemSheet` | `(types, SheetClass, {scope, label, makeDefault})` | `extension-api.mjs:115-146` / `48-79` |

### The canonical loop

`GF/module/gongfarmers-class-data.js:1772-1779` — byte-identical at
`CC/module/crawl-class-data.js:354-361`:

```js
export function registerGongfarmersClasses (api) {
  for (const [classId, def] of Object.entries(GONGFARMERS_CLASSES)) {
    api.registerClassMixin(classId, def.mixin)
    api.registerClassDefaults(classId, def.defaults)
    api.registerSheetPart(classId, def.sheetPart)
    api.registerHomebrewClassForProgressionLoad(classId, classId)
  }
}
```

### One class descriptor, verbatim (`CC/module/crawl-class-data.js:58-82`)

```js
  bard: {
    label: 'Bard.ActorSheetBard',
    sheetHeight: 635,
    mixin (schema) {
      const f = foundry.data.fields
      schema.skills.fields.talentDie = new f.SchemaField({
        label: new f.StringField({ initial: 'Bard.TalentDie' }),
        die: new f.StringField({ initial: '1d14' })
      })
    },
    defaults: {
      sheetClass: 'Bard',
      localize: { 'class.className': 'Bard.Bard' },
      literal: {
        'details.critRange': 20,
        'config.showSkills': true,
        'config.showSpells': true,
        'class.spellCheckAbility': 'int'
      }
    },
    sheetPart: {
      parts: { ...commonParts(), bard: { id: 'bard', template: classPartial('bard') } },
      tabs: { sheet: { tabs: [{ id: 'bard', group: 'sheet', label: 'Bard.Bard' }] } }
    }
  },
```

with helpers (`CC/module/crawl-class-data.js:39-49`):

```js
function classPartial (name) { return `modules/${MODULE_ID}/templates/actor-partial-${name}.html` }
function commonParts () {
  return {
    character: { id: 'character', template: 'systems/dcc/templates/actor-partial-pc-common.html' },
    equipment: { id: 'equipment', template: 'systems/dcc/templates/actor-partial-pc-equipment.html' }
  }
}
```

### The sheet stub is 7 lines (`CC/module/actor-sheets-bard.js`)

```js
import { DCCSheet } from '/systems/dcc/module/actor-sheets-dcc.js'

class ActorSheetBard extends DCCSheet {
  static DEFAULT_OPTIONS = { position: { height: 635 } }
  static CLASS_ID = 'bard'
}

export { ActorSheetBard }
```

`DCCSheet` resolves `CLASS_PARTS`/`CLASS_TABS` from `CONFIG.DCC.sheetParts[this.CLASS_ID]` via
inherited static getters (`DCC/module/actor-sheets-dcc.js:69-78`) and runs the first-open write
in `_prepareContext` (`:81-92`):

```js
    const classId = this.constructor.CLASS_ID
    if (classId) {
      const result = await applyClassDefaults(this.options.document, classId)
      if (result === 'initialized') {
        const created = await applyClassStartingItems(this.options.document, classId)
        if (created.length > 0) this.render(false)
      }
    }
```

`applyClassDefaults` returns `'initialized' | 'regenerated' | 'unchanged'`
(`extension-api.mjs:333-373`).

### Entry point (`GF/module/dcc-gongfarmers-classes.js:120-141`)

```js
Hooks.once('init', async function () {
  Hooks.callAll('dcc.registerLevelDataPack', 'wfvtt.wf-class-level-data')
  registerWeirdFrontiersClasses(game.dcc)   // game.dcc exists: system init runs before module init
  for (const { sheet, scope, label } of WF_SHEETS) {
    game.dcc.registerActorSheet('Player', sheet, { scope, label })
  }
})
```

`scope` is the persisted `flags.core.sheetClass` id, one per class
(`scope: 'wfvtt-gunslinger'`). **Do not pass `makeDefault: true`** for class sheets — they are
alternates, and `makeDefault` unregisters Foundry's core sheet for the whole subtype
(`extension-api.mjs:104-107`, `135-141`).

### `registerClassStartingItems` (optional)

The only built-in is dwarf's ShieldBash (`DCC/module/built-in-class-starting-items.mjs:30-45`):

```js
  dwarf: [{
    nameKey: 'DCC.ShieldBash',
    type: 'weapon',
    img: 'systems/dcc/styles/images/game-icons-net/shield-bash.svg',
    system: { melee: true, damage: '1d3', config: { actionDieOverride: '1d14' } }
  }]
```

Dedupe is on `(type, localized name)` — **a user rename permanently disables the auto-create for
that actor** (`extension-api.mjs:471-474`).

---

## 4. Class level-up / progression data

Two independent consumers of the same `level` Items:

**A. The level-up dialog** (`DCC/module/actor-level-change.js:160-162`). Reads
`system.class.className`, lowercases, replaces spaces with hyphens, looks for a `level`-type Item
named `<slug>-<level>` — registered packs first, then loose world Items
(`DCC/docs/user-guide/Adding-Level-Up-Data.md:16-31, 130-143`).

**B. The lib progression loader** (`DCC/module/adapter/foundry-data-loader.mjs:209-226`). Walks
`CONFIG.DCC.classLevelNames` (populated by `registerHomebrewClassForProgressionLoad`) and for each
classId looks for `` `${itemPrefix}-${level}` `` in every registered pack, **levels 1–10**
(`MAX_LEVEL = 10`, `:48`; loop at `:171-172`). Feeds `registerClassProgressions`, which powers
`getSavingThrows` / `getCritDie` / `getSaveBonus`.

### Item naming — non-negotiable

`{itemPrefix}-{level}`, lowercase, spaces → hyphens. `Blood-Witch-1` and `Blood Witch 1` both
fail (`Adding-Level-Up-Data.md:41-60`). `itemPrefix` need not equal `classId`
(`extension-api.mjs:554-559`), but every shipping module sets them equal.

### Item data model — `DCC/module/data/item/level-data.mjs:9-18`

```js
{ class, level, levelData, levelDataLawful, levelDataNeutral, levelDataChaotic }  // all StringField
```

**All stats live inside `system.levelData` as newline-separated `path=value` lines.** Setting
`system.details.attackBonus` on the item itself does nothing — Foundry silently drops it
(`Adding-Level-Up-Data.md:35-42`).

Real item (`GF/packs/gongfarmers-class-level-data/src/aetherian_warcat_10_*.json`):

```json
"name": "aetherian-warcat-10",
"type": "level",
"system": {
  "class": "aetherian-warcat",
  "level": "10",
  "levelData": "system.details.attackBonus=+0\nsystem.attributes.critical.die=1d24\nsystem.attributes.critical.table=IV\nsystem.attributes.actionDice.value=1d20,1d20,1d14\nsystem.attributes.hitDice.value=1d12\nsystem.attributes.speed.value=65\nsystem.skills.deedDie.die=1d10+1\nsystem.saves.ref.classBonus=+6\nsystem.saves.frt.classBonus=+4\nsystem.saves.wil.classBonus=+3\n",
  "levelDataLawful": "system.details.title.value=Legendary War Cat\n"
}
```

Valid `levelData` paths (`Adding-Level-Up-Data.md:96-105`): `attributes.hitDice.value`,
`attributes.actionDice.value` (comma-separated for multiple action dice),
`attributes.critical.die`, `attributes.critical.table`, `details.attackBonus`,
`saves.{frt,ref,wil}.classBonus`. **`system.details.casterLevel` and `system.details.spellbook`
do not exist** (`:116-119`).

### Registering the pack

```js
Hooks.once('init', () => {
  Hooks.callAll('dcc.registerLevelDataPack', 'wfvtt.wf-class-level-data')
  game.dcc.registerHomebrewClassForProgressionLoad('gunslinger', 'gunslinger')
})
```

> ⚠️ `DCC/docs/dev/EXTENSION_API.md:565` and `extension-api.mjs:565` show
> `CONFIG.DCC.levelDataPacks.addPack(...)` instead. **That recipe is wrong on a fresh world** —
> `CONFIG.DCC.levelDataPacks` initialises to `null` (`DCC/module/config.js:432`) and only becomes
> a `TablePackManager` inside the hook handler (`DCC/module/settings-table-hooks.mjs:58-63`).
> Both shipping modules use the hook form (`GF/module/dcc-gongfarmers-classes.js:128`;
> `CC/module/dcc-crawl-classes.js:47`); `addPack` appears in none of the three.

`GF/module/buildLevelItems.mjs` is the pattern to copy for generating pack JSON from an
authoritative per-class chart, with **deterministic sha256-derived 16-char ids** so re-running
yields a stable diff (`:44-49`).

---

## 5. Data model — the paths a module writes

Registration: `CONFIG.Actor.dataModels = { Player, NPC, Party }`,
`CONFIG.Item.dataModels = { weapon, ammunition, armor, container, equipment, level, mount, spell, treasure, skill }`
(`DCC/module/init-hook.mjs:199-220`), mirrored in `DCC/system.json:4-21`.

### Base actor (Player/NPC/Party) — `DCC/module/data/actor/base-actor.mjs:121-278`

| Path | Type / notes |
|---|---|
| `system.abilities.<str\|agl\|sta\|per\|int\|lck>.value` | base score, hand-editable |
| `…​.otherMod` | **the Active-Effect target**; shifts derived `effectiveValue` |
| `…​.mod`, `…​.effectiveValue` | **computed — read only** |
| `system.attributes.hp.{value,min,max,temp,tempmax}` | integers (`:175-181`) |
| `system.attributes.ac.{value,checkPenalty,otherMod,speedPenalty}` | `:150-155` |
| `system.attributes.init.{die,value,otherMod}` | `value` is a **string** `'+0'` (`:182-186`) |
| `system.attributes.actionDice.value` / `.options[]` | `'1d20'`; `options` = `{value,label}[]` (`:156-164`) |
| `system.attributes.initDice.value` / `.options[]` | `:187-198` |
| `system.attributes.hitDice.value` | `'1d4'` (`:172-174`) |
| `system.attributes.critical.{die,table}` | `'1d4'` / `'I'` (`:165-168`) |
| `system.attributes.fumble.die` | `'1d4'` (`:169-171`) — **no fumble *table* field on the actor**; it is world/global via `dcc.setFumbleTable` |
| `system.attributes.speed.{value,base,otherMod,special,swim,fly}` | **`value` is a String** — may be `"30'"` or `"25/50/100"` (`:199-206`) |
| `system.details.{alignment,attackBonus,critRange,sheetClass,languages,birthAugur,birthAugurLuckMod}` | `:213-240` |
| `system.details.attackHitBonus.{melee,missile}.{value,adjustment}` | strings (`:216-225`) |
| `system.details.attackDamageBonus.{melee,missile}.{value,adjustment}` | `:226-235` |
| `system.details.{level,occupation,title,xp,notes}.value` | `:241-257` |
| `system.saves.<frt\|ref\|wil>.{value,classBonus,otherBonus,override,label,abbreviation}` | `SaveField`, `DCC/module/data/fields/save-field.mjs:14-23`. `value` is the computed total; write `classBonus` from level data, `otherBonus` from AEs |
| `system.currency.{pp,ep,gp,sp,cp}` | `CurrencyField` (`:277`) |

Extension seam: `Hooks.callAll('dcc.defineBaseActorSchema', schema)` at `base-actor.mjs:291`.

### Player-only — `DCC/module/data/actor/player-data.mjs:61-168`

- `system.class.{className,classLink,mightyDeedsLink,spellcastingLink,spellburnLink}` — **these
  five are all that remain in the static body**; every other `class.*` field is contributed by a
  class mixin (`:65-94`).
- `system.skills.detectSecretDoors.{label,ability,value,otherMod}` — the only base-body skill
  (`:103-111`).
- `system.config.*` — `attackBonusMode` (`'flat'|'manual'|'autoPerAttack'`), `actionDice`,
  `addClassLevelToInitiative`, `maxLevel`, `rollAttackBonus`, `computeAC`, `baseACAbility`,
  `computeSpeed`, `computeCheckPenalty`, `computeInitiative`,
  `computeMeleeAndMissileAttackAndDamage`, `computeSavingThrows`, `sortInventory`,
  `removeEmptyItems`, `showSpells`, `showSkills`, `showBackstab`, `showSwimFlySpeed` (`:114-133`).
- Order: `applyClassMixins(schema)` at `:143`, **then**
  `Hooks.callAll('dcc.definePlayerSchema', schema)` at `:165`.

### Luck

There is no dedicated luck block — Luck is the `lck` ability, it is the system's
`secondaryTokenAttribute` (`DCC/system.json`), and Fleeting Luck is a separate subsystem
(`game.dcc.FleetingLuck`). The thief luck die is a mixin field, `system.class.luckDie`
(`DCC/module/built-in-class-mixins.mjs:126`).

### Crit / fumble tables

Not on the actor. They arrive via world settings plus module-emitted hooks:
`dcc.registerCriticalHitsPack`, `dcc.setFumbleTable`, `dcc.registerDisapprovalPack`,
`dcc.registerMightyDeedsPack`, `dcc.setDivineAidTable`, `dcc.setLayOnHandsTable`,
`dcc.setTurnUnholyTable`, `dcc.registerMercurialMagicTable(classKey, tableName)`
(`EXTENSION_API.md:88-97`). Emit from `dcc.ready`:

```js
Hooks.once('dcc.ready', () => {
  Hooks.callAll('dcc.registerCriticalHitsPack', 'wfvtt.wf-crit-tables')
  Hooks.callAll('dcc.setFumbleTable', 'wfvtt.wf-tables.Fumbles')
})
```

Active-Effect-safe keys are enumerated at `DCC/module/config.js:~370-425`.

### Item — weapon (`DCC/module/data/item/weapon-data.mjs:47-88`)

`system.{melee,damage,damageWeapon,damageBonus,critDie,critRange,critTable,fumbleRange,actionDie,attackBonus,attackBonusWeapon,attackBonusLucky,backstabDamage,initiativeDie,initiativeBonus,range,thrown,twoHanded,subdual,trained,toHit,doubleIfMounted,shortRangeStrength,twoWeaponPrimary,twoWeaponSecondary}`
plus a `system.config.*` override bag (`actionDieOverride`, `critDieOverride`,
`critRangeOverride`, `critTableOverride`, `fumbleRangeOverride`, `damageOverride`,
`attackBonusOverride`, `initiativeBonusOverride`, `initiativeDieOverride`) — **the override bag is
how a WF firearm gets bespoke crit/fumble behaviour without touching the actor.**

---

## 6. Compendium packs

- **Source of truth is JSON in git**: `packs/<name>/src/*.json`. Compiled LevelDB (`*.ldb`,
  `LOG*`, `CURRENT`, `MANIFEST*`, `LOCK`) is **gitignored**.
  *Verified 2026-09-12: zero `.ldb` files tracked in `xcc`, `dcc-gongfarmers-classes` or
  `dcc-crawl-classes`; the only tracked pack paths are `packs/*/src/*.json`.* (Note: the
  `dcc-core-book` **content** module does the opposite and commits both — do not copy it.)
- Build scripts are 15 lines and drive off the manifest (`CC/module/compilePacks.js:1-15`;
  identical in GF; the DCC copy reads `system.json` instead of `module.json`):
  ```js
  import { compilePack } from '@foundryvtt/foundryvtt-cli'
  const data = JSON.parse(fs.readFileSync('module.json', 'utf8'))
  for (const pack of data.packs || []) {
    await compilePack(`packs/${pack.name}/src`, `packs/${pack.name}`)
  }
  ```
  `extractPacks.js` is the mirror.
- Scripts: `"todb": "node module/compilePacks.js"`, `"tojson": "node module/extractPacks.js"`
  (`GF/package.json:5-10`). Dep: `@foundryvtt/foundryvtt-cli ^3.0.4`.
- **v14 is LevelDB only** — NeDB `.db` files are gone; `packs/<name>/` is a directory.
- Round-trip: `todb` → start Foundry → edit → unlock compendium → right-click Adventure →
  **Rebuild Adventure** → drag folders → **quit Foundry** → `tojson` → commit
  (`DCC/docs/dev/LEVELDB_WORKFLOW.md:1-22`).
- **Pack folders** are ordinary documents in `src/` with `"_key": "!folders!<id>"` and
  `"type": "Item"`; items reference them via `"folder": "<folderId>"`. There is no `packFolders`
  manifest key in any of the three class modules.
- **Cache gotchas** (`DCC/docs/dev/PACKS.md:244-258`): `tojson` fails while Foundry is running
  (LevelDB `LOCK`); a new or changed pack may not appear until Foundry is **restarted**. Resolve
  merge conflicts in JSON — `tojson` before pulling, `todb` after.

---

## 7. New-module scaffolding checklist

### `module.json`

```json
{
  "id": "wfvtt",
  "title": "Weird Frontiers",
  "version": "0.1.0",
  "compatibility": { "minimum": "14", "verified": "14", "maximum": "14" },
  "relationships": {
    "systems": [
      { "id": "dcc", "type": "system",
        "compatibility": { "minimum": "0.70.50", "verified": "0.70.50" } }
    ]
  },
  "esmodules": ["module/wfvtt.js"],
  "flags": { "hotReload": { "extensions": ["js", "css", "html", "json"] } },
  "styles": [
    { "src": "styles/variables.css", "layer": "variables" },
    { "src": "styles/wfvtt.css",     "layer": "system" }
  ],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json", "flags": {} }],
  "packs": [
    { "name": "wf-class-level-data", "label": "Weird Frontiers Class Level Data",
      "path": "packs/wf-class-level-data", "system": "dcc", "type": "Item" }
  ],
  "url": "https://github.com/antipop001/wfvtt",
  "manifest": "…/releases/download/v0.1.0/module.json",
  "download": "…/releases/download/v0.1.0/wfvtt.zip",
  "license": "LICENSE.txt"
}
```

The **system relationship pin carries only `minimum` + `verified`, no `maximum`**
(`XCC/module.json:19-30` pins `0.70.34`; GF/CC pin `0.70.0`). Foundry `compatibility` is
`14/14/14` in all three. Pack entries are minimal — `name`/`label`/`path`/`system`/`type`, no
`ownership`, no `flags`, no `packFolders`. `manifest`/`download` are **per-version immutable
URLs, rewritten by CI, never by hand** (`DCC/docs/dev/RELEASE_PROCESS.md:60-72`).

### `latest.json`

A **byte-identical copy of `module.json`** at the repo root, kept in sync by
`foundry-manifest-update-action`. Verified identical size in all three repos.

### `version.txt`

Bare version, no `v` prefix. **Committing it to `main` is the release trigger**, and it must be
its own commit — a bump folded into a squash-merged feature PR makes the feature vanish from its
own release notes (the DCC system's own CLAUDE.md:96-103).

### `lang/en.json`

Flat dotted top-level keys with a per-class prefix is the class-module convention
(`GF/lang/en.json`: 1101 flat keys like `"Assassin.PoisonDie"`; `CC/lang/en.json`: 102). XCC
instead nests under a single `"XCC"` root. **Use a single `WF.*` root** — see §9 on collisions.

### `.github/workflows/` — three thin wrappers over shared org actions

`create-github-release.yml` (`XCC/.github/workflows/create-github-release.yml:3-28`):

```yaml
on:
  push:
    branches: ['main']
    tags-ignore: ['**']
    paths: ['version.txt']
jobs:
  create_github_release:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v6
      - uses: foundryvtt-dcc/foundry-release-action@main
        with:
          actionToken: ${{ secrets.GITHUB_TOKEN }}
          manifestFileName: 'module.json'
          manifestProtectedTrue: false
```

`update-foundry-manifest-after-release.yml` — on `release: published`,
`foundryvtt-dcc/foundry-manifest-update-action@main`, rewrites `manifest`/`download` back into
`module.json` + `latest.json` on `main`.
`foundry-website-update.yml` — on `release: published`,
`foundryvtt-dcc/foundry-package-release-action@main`.

> ⚠️ The release action **always produces a draft**; a human publishes it, and publishing is what
> fires the two `release: published` workflows (the DCC system's own CLAUDE.md:86-94). Separately, the
> package-release endpoint must be `https://foundryvtt.com/_api/packages/release_version/`, **not**
> `api.foundryvtt.com` — the wrong host returns `status: success` while silently never updating
> Foundry's package cache. It froze DCC at 0.67.7 and made XCC vanish on v14
> (`DCC/docs/dev/RELEASE_PROCESS.md:74-90`). *(A textbook §4c "verifying a proxy is not verifying
> the thing".)*

### `.gitignore` — the load-bearing tail

```
node_modules/
*.lock
packs/**/*.ldb
packs/**/*.log
packs/**/LOCK
packs/**/LOG*
packs/**/CURRENT
packs/**/MANIFEST*
```

### `package.json`

`"type": "module"`, node ≥ 20 (24 for the DCC system itself). Scripts: `format` (StandardJS
`--fix`), `todb`, `tojson`, plus a level-item generator. devDeps: `@foundryvtt/foundryvtt-cli
^3.0.4`, `standard ^17.1.2`, `eslint ^10.7.0`; add `vitest` for tests — XCC's `test.yml` checks
out `foundryvtt-dcc/dcc` into `.dcc-system` and sets `DCC_PATH` so `/systems/dcc/...` imports
resolve (`XCC/.github/workflows/test.yml:17-40`, `XCC/vitest.config.js:8,16`).

---

## 8. Stable vs. internal surface

### Stable hooks (`DCC/docs/dev/EXTENSION_API.md:78-100`)

`dcc.ready` · `dcc.defineBaseActorSchema` · `dcc.definePlayerSchema` · `dcc.modifyAttackRollTerms`
· `dcc.rollWeaponAttack` · `dcc.postActorImport` · `dcc.registerCriticalHitsPack` ·
`dcc.registerDisapprovalPack` · `dcc.registerMightyDeedsPack` · `dcc.registerLevelDataPack` ·
`dcc.setFumbleTable` · `dcc.setDivineAidTable` · `dcc.setLayOnHandsTable` ·
`dcc.setMercurialMagicTable` · `dcc.registerMercurialMagicTable` · `dcc.setTurnUnholyTable` ·
`dcc.afterComputeSpellCheck` · `dcc.afterSpellCheckResult` · `dcc.getSidebarTools`

### Stable `game.dcc.*` (`EXTENSION_API.md:118-140`)

`DCCRoll` · `DiceChain` · `FleetingLuck` · `processSpellCheck` · `registerActorSheet` ·
`registerItemSheet` · `registerClassMixin` · `registerClassDefaults` ·
`registerClassStartingItems` · `registerSheetPart` · `registerClassProgression(s)` ·
`registerHomebrewClassForProgressionLoad` · `registerVariant` · `getActiveVariant` ·
`buildMightyDeedPrompt` · `attachMightyDeedListeners` · `buildSpellburnTerm` · `applySpellburn`

Stable by implication (recommendation 4, `:188-191`): `DCCRoll.createRoll` /
`DCCRoll.cleanFormula` and `DiceChain.bumpDie` / `calculateCritAdjustment` /
`calculateProportionalCritRange`.

### Internal — avoid (`EXTENSION_API.md:142-156`)

`game.dcc.DCCActor` · `RollRequestDialog` · `postRollRequest` · `SpellDuel` · `SpellResult` ·
`TableResult` · `getSkillTable` · `rollDCCWeaponMacro` / `getMacroActor` / `getMacroOptions`
(macro surface, de-facto stable but not a module API) · hook
`dcc.registerSpellSideEffectsPack`.

**Dead:** none. `dcc.update` was removed from XCC in 2026-05 — never emitted
(`EXTENSION_API.md:108-110`).

---

## 9. Gotchas

### Hook timing

1. **System `init` runs before module `init`** — `game.dcc` is safe at module `init`
   (`GF/module/dcc-gongfarmers-classes.js:132-133`).
2. **Mixins must register in `init`**, before the Player schema is first constructed
   (`GF/module/gongfarmers-class-data.js:1768`).
3. **System settings register in `ready`, not `init`** (`DCC/module/ready-hook.mjs:76`), and the
   `activeVariant` `choices` map is a **snapshot** of `CONFIG.DCC.variants` at that moment
   (`DCC/module/settings.js:197-200`). Register the variant in `init` or it never appears.
4. **The progression loader runs at `ready` *before* `dcc.ready` fires** (`ready-hook.mjs:136`
   then `:145`). Register level-data packs at **`init`**. Registering at `dcc.ready` still works
   for the level-up *dialog* (which reads the registry lazily) but silently misses the lib
   progression load.
5. `CONFIG.DCC.levelDataPacks` is `null` until the hook first fires — use the hook, not
   `addPack` (§4).
6. **v14: `get*ContextOptions` hooks fire exactly once, at first render — before `ready`.**
   Registering them from `ready` silently does nothing (`DCC/docs/dev/V14.md:141-150`, issue
   #826). Register at import time or `init`; put dynamic logic in the entry's `visible` predicate.
7. Table-registration hooks (`dcc.registerCriticalHitsPack` etc.) fire from `dcc.ready` in
   content modules — that is the right place for those.

### Schema

8. **Build fresh `SchemaField` instances inside every mixin call.** Foundry may re-invoke
   `defineSchema()`; sharing field objects across schemas corrupts state
   (`DCC/module/built-in-class-mixins.mjs:45-48`, `extension-api.mjs:160-165`).
9. **Don't redeclare fields a DCC built-in mixin already contributes** — the thief skill block,
   `class.corruption` and the wizard fields land on the shared Player schema for *every* Player
   once their mixin registers (`GF/module/gongfarmers-class-data.js:11-14`).
10. Mixin order is deterministic **sorted by `classId`**, not registration order
    (`extension-api.mjs:217-228`).
11. **Writes to `literal` paths that aren't on the schema are silently dropped.** DCC's own
    built-in defaults contain such no-ops on purpose
    (`DCC/module/built-in-class-defaults.mjs:31-36`). Class defaults can look correct and do
    nothing.

### Class identity

12. `classId` / `static CLASS_ID` / the `{prefix}-{level}` item name are all
    **lowercase-hyphenated**; `defaults.sheetClass` is the **capitalized sentinel** written to
    `system.details.sheetClass` (`'Minovean-Sage'` for classId `'minovean-sage'`,
    `GF/module/gongfarmers-class-data.js:1730-1735`). `applyClassDefaults` dispatches on exact
    string equality with `sheetClass` (`extension-api.mjs:341`) — **a mismatch means the
    first-open block fires on every render.**
13. **Dispatch on `system.details.sheetClass`, never `system.class.className`** — `className` is
    the *localized* display label, so equality checks break in non-English games. There is a
    vitest guard that greps module source for the anti-pattern
    (`EXTENSION_API.md:224-253`).

### Sheets

14. `makeDefault: true` unregisters Foundry's core sheet for the whole subtype — class sheets
    must omit it (`extension-api.mjs:104-107`).
15. `scope` is the persisted `flags.core.sheetClass` id — **changing it orphans every existing
    character's sheet choice.** Pick it once.
16. **Cross-package import paths are fragile and inconsistent across the ecosystem.** CC/GF use a
    relative `../ ×7` walk; XCC uses a Foundry-absolute
    `import DCCActorSheet from '/systems/dcc/module/actor-sheet.js'` with
    `/* eslint-disable import/no-absolute-path */`. **Prefer the absolute form** (depth-independent)
    and alias it in vitest.
17. `sheetTheme` is applied in the **shared** `DCCActorSheet._onRender`
    (`DCC/module/actor-sheet.js:246`) — it lands on NPC and Party sheets too.

### i18n

18. **Lang keys are a global flat namespace.** Two modules both using `Assassin.*` collide.
    Namespace everything under `WF.*`.
19. **A module lang file only outranks the system for a locale the module actually translates.**
    To override `DCC.*` strings, do it in JS at `i18nInit`, not in `lang/en.json` — see
    `XCC/module/xcc-i18n.js:3-17, 63-72`, which flattens an `XCC.DCCOverrides` block onto
    `game.i18n.translations`.

### v13 → v14 (`DCC/docs/dev/V14.md:101-160`)

20. `CONST.ACTIVE_EFFECT_MODES` → `CONST.ACTIVE_EFFECT_CHANGE_TYPES` (string `change.type`);
    `duplicate()` → `deepClone()`; `objectsEqual` → `equals()`; `Math.clamped` → `Math.clamp`;
    `TextEditor.implementation.enrichHTML()` → `TextEditor.enrichHTML()`;
    `mergeObject({performDeletions})` → `{applyOperators}`; `statusEffects[].icon` → `.img`.
21. Roll mode strings: `'publicroll'|'gmroll'|'blindroll'|'selfroll'` →
    `'public'|'gm'|'blind'|'self'`; the `rollMode` setting → `messageMode`.
22. `-=key` / `==key` on `updateSource` are removed — use `foundry.data.operators`.
23. `game.activeTool` / `SceneControls#tool` can be `null`.
24. Node 24 required for v14.

### Rolls

25. `DCCRoll.createRoll` with `showModifierDialog: true` now rejects with a
    `RollCancelledError` on dialog close (it used to reject with bare `null`). **Duck-type on
    `err?.isRollCancellation === true`** — `instanceof` is unsafe across module copies
    (`EXTENSION_API.md:122`).
