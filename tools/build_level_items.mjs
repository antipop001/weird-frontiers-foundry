/**
 * Generate the class level-progression compendium source from data/classes/*.json.
 *
 *   node tools/build_level_items.mjs
 *
 * Writes packs/wf-class-level-data/src/ — one `level` Item document per class level
 * plus one folder document per class — then `npm run todb` compiles that to LevelDB.
 *
 * Ids are derived by sha256 from a stable seed, so re-running produces a byte-identical
 * tree and a clean git diff. Never hand-edit the output; edit the chart and re-run.
 *
 * WHAT THIS DELIBERATELY DOES NOT EMIT, and why — all three verified against the DCC
 * system source at reference/dcc/ on 2026-09-12:
 *
 *  - `system.attributes.fumble.die`. DCC recomputes the fumble die from equipped armor
 *    on EVERY prepareData and the overwrite is unconditional — there is no config gate
 *    (actor.js:76-99; contrast checkPenalty immediately below it, which is gated). WF has
 *    no armor at all, so that loop always falls through to a hardcoded '1d4'. Writing the
 *    die here would look correct in the compendium and be wrong in play, which is worse
 *    than not writing it. WF's per-class/per-level fumble die needs code.
 *
 *  - `system.attributes.critical.table`. WF keys crit tables to DAMAGE TYPE
 *    (Blunt/Piercing/Slashing/Firearms/Wrestling), not to class and level as DCC does
 *    (Weird_Frontiers_V6.md:2866). The table belongs to the weapon, not the character.
 *
 *  - `system.details.level.value`. The level-up dialog sets it itself (actor-level-change.js:306).
 *
 * AND ONE THING IT PUTS SOMEWHERE NON-OBVIOUS: the class title goes in the MAIN levelData
 * block, not in levelDataLawful/Neutral/Chaotic. Those three are applied only when the
 * actor's `details.alignment` is exactly 'l' / 'n' / 'c' (actor-level-change.js:118-126).
 * WF replaces alignment with the Path, so an alignment-keyed title would silently never
 * apply. WF titles do not vary by Path anyway (Weird_Frontiers_V6.md:1006).
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHARTS = path.join(REPO, 'data', 'classes')
const OUT = path.join(REPO, 'packs', 'wf-class-level-data', 'src')
// The fumble die cannot ride in levelData (DCC recomputes it from armor every prepare), so it
// is delivered as an Active Effect instead — see module/wf-fumble.mjs. That code needs the
// per-level values synchronously at runtime, so they are emitted here rather than duplicated
// by hand: one source of truth, the chart the ratchet verifies against the books.
const FUMBLE_DATA = path.join(REPO, 'module', 'wf-fumble-data.mjs')
// Everything the runtime needs to register a class, derived from the same charts: its label,
// hit die, and which signature tracks it has. Generated so adding a class is a data change.
const REGISTRY = path.join(REPO, 'module', 'wf-class-registry.mjs')

// Foundry ids are exactly 16 chars of [A-Za-z0-9].
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const idFor = (seed) => {
  const digest = createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += ALPHABET[digest[i] % ALPHABET.length]
  if (!/^[A-Za-z0-9]{16}$/.test(id)) throw new Error(`bad id generated for ${seed}: ${id}`)
  return id
}

// Foundry validates this as a document id: exactly 16 chars of [A-Za-z0-9]. A 15-char
// value fails validation on EVERY document in the pack, and the resulting error aborts
// world load before `game.ready` — the world simply never finishes booting, with nothing
// in the server log to say why. Asserted below so it cannot regress silently.
/**
 * Quote an object key only when it is not a bare JS identifier. Hyphenated class ids —
 * dog-soldier, mystic-monk, sin-eater — are NOT valid identifiers, and emitting them unquoted
 * produced a module that failed to parse at all. Quoting everything instead trips the linter.
 */
const key = (name) => /^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`

const STAMP_USER = 'wfvtt00000000000'
if (!/^[A-Za-z0-9]{16}$/.test(STAMP_USER)) {
  throw new Error(`STAMP_USER must be exactly 16 alphanumeric chars, got ${STAMP_USER.length}`)
}

const STATS = {
  compendiumSource: null,
  duplicateSource: null,
  exportSource: null,
  coreVersion: '14.367',
  systemId: 'dcc',
  systemVersion: '0.70.50',
  createdTime: 0,
  modifiedTime: 0,
  lastModifiedBy: STAMP_USER
}

/**
 * The newline-separated `path=value` lines the level-up dialog splits on '=' and hands
 * straight to actor.update() (actor-level-change.js:130-136). There is no whitelist —
 * any real schema path works — but a path absent from the schema is silently dropped,
 * and one the system recomputes is silently clobbered. See the header.
 */
function levelDataFor (chart, level) {
  const lines = [
    // Per-level attack bonus where the chart has one. Twelve of the thirteen classes carry an
    // ATTACK BONUS column; the Gunslinger alone has none and relies on the Deadeye die instead,
    // so it falls back to the chart-level default of '+0'. An earlier version always used the
    // chart-level default, which flattened every class to +0 at every level.
    `system.details.attackBonus=${level.attackBonus ?? chart.attackBonus.value}`,
    `system.attributes.critical.die=${level.critDie}`,
    `system.attributes.actionDice.value=${level.actionDice}`,
    `system.attributes.hitDice.value=${chart.hitDie}`,
    `system.saves.ref.classBonus=+${level.ref}`,
    `system.saves.frt.classBonus=+${level.fort}`,
    `system.saves.wil.classBonus=+${level.will}`
  ]
  // Only the Gunslinger chart has a crit threat range. Emitting it unconditionally wrote the
  // literal string "undefined" for the other twelve — and because details.critRange is a
  // NumberField, that failed validation and aborted the ENTIRE level-up update, silently
  // leaving every other stat at its default. Absent means absent.
  if (level.critRange !== undefined && level.critRange !== null) {
    lines.push(`system.details.critRange=${level.critRange}`)
  }
  if (level.title) lines.push(`system.details.title.value=${level.title}`)
  return lines.join('\n') + '\n'
}

async function main () {
  await fs.mkdir(OUT, { recursive: true })

  const charts = (await fs.readdir(CHARTS)).filter(f => f.endsWith('.json')).sort()
  if (charts.length === 0) {
    console.error(`No class charts found in ${path.relative(REPO, CHARTS)}`)
    process.exit(1)
  }

  // Anything already on disk that this run does not rewrite is stale and gets removed,
  // so a renamed or deleted level cannot leave an orphan document in the pack.
  const stale = new Set(await fs.readdir(OUT).catch(() => []))
  const write = async (name, doc) => {
    stale.delete(name)
    await fs.writeFile(path.join(OUT, name), JSON.stringify(doc, null, 2) + '\n')
  }

  for (const file of charts) {
    const chart = JSON.parse(await fs.readFile(path.join(CHARTS, file), 'utf8'))
    const { classId, label } = chart

    if (!Array.isArray(chart.levels) || chart.levels.length === 0) {
      console.error(`${file}: missing or empty "levels" array`)
      process.exit(1)
    }
    if (!classId || !label || !chart.hitDie || !chart.attackBonus?.value) {
      console.error(`${file}: needs classId, label, hitDie and attackBonus.value`)
      process.exit(1)
    }

    const folderId = idFor(`wfvtt:folder:${classId}`)
    await write(`${label.replace(/\s+/g, '_')}_Level_Items_${folderId}.json`, {
      name: `${label} Level Items`,
      type: 'Item',
      color: '#6b4423',
      folder: null,
      _id: folderId,
      description: '',
      sorting: 'a',
      sort: 0,
      flags: {},
      _stats: STATS,
      _key: `!folders!${folderId}`
    })

    for (const level of chart.levels) {
      const id = idFor(`wfvtt:level:${classId}:${level.level}`)
      // The name is the lookup key: `{classId}-{level}`, lowercase, hyphenated. The
      // level-up dialog builds exactly this string and will find nothing if it differs.
      await write(`${classId.replace(/-/g, '_')}_${level.level}_${id}.json`, {
        img: 'icons/svg/upgrade.svg',
        system: {
          class: classId,
          level: String(level.level),
          levelData: levelDataFor(chart, level),
          levelDataLawful: '',
          levelDataNeutral: '',
          levelDataChaotic: ''
        },
        name: `${classId}-${level.level}`,
        type: 'level',
        folder: folderId,
        _id: id,
        effects: [],
        sort: level.level * 100,
        ownership: { default: 0 },
        flags: {},
        _stats: STATS,
        _key: `!items!${id}`
      })
    }

    console.log(`${classId}: ${chart.levels.length} levels, folder ${folderId}`)
  }

  for (const name of stale) {
    await fs.unlink(path.join(OUT, name))
    console.log(`removed stale ${name}`)
  }

  await writeFumbleData(charts)
  await writeRegistry(charts)
}

/** Emit module/wf-class-registry.mjs: one entry per class, straight from the charts. */
async function writeRegistry (files) {
  const entries = []
  for (const file of files) {
    const chart = JSON.parse(await fs.readFile(path.join(CHARTS, file), 'utf8'))
    const first = chart.levels[0] ?? {}
    const fields = [
      `    label: '${chart.label.replace(/'/g, "\\'")}'`,
      `    sheetClass: '${chart.sheetClass}'`,
      `    hitDie: '${chart.hitDie}'`,
      `    critDie: '${first.critDie ?? ''}'`,
      `    critRange: ${first.critRange ?? 20}`
    ]
    // A class's signature die (Deadeye, Mojo, Ballad, Lucha, Chi, Creed) and its percentage or
    // secondary track, where the chart has them. Absent keys mean the class has none.
    if (chart.classDieLabel) {
      fields.push(`    classDieLabel: '${chart.classDieLabel}'`)
      fields.push(`    classDie: '${first.classDie ?? ''}'`)
    }
    if (chart.percentTrackLabel) {
      fields.push(`    percentTrackLabel: '${chart.percentTrackLabel}'`)
      fields.push(`    percentTrack: '${first.percentTrack ?? ''}'`)
    }
    if (chart.secondaryTrackLabel) {
      fields.push(`    secondaryTrackLabel: '${chart.secondaryTrackLabel}'`)
      fields.push(`    secondaryTrack: '${first.secondaryTrack ?? ''}'`)
    }
    entries.push(`  ${key(chart.classId)}: {\n${fields.join(',\n')}\n  }`)
  }
  const body = `/**
 * GENERATED by tools/build_level_items.mjs from data/classes/*.json. Do not edit.
 *
 * One entry per Weird Frontiers class: its label, hit die, 1st-level crit die and crit range,
 * and whichever signature tracks its progression chart carries — the class die (Deadeye, Mojo,
 * Ballad, Lucha, Chi, Creed), a percentage track (Derangement, Fame) or a secondary track
 * (Living Weapon, Battle Hardened). A class without one simply omits the key.
 *
 * Values are the 1st-level entries; every level after that is written by the level-up dialog
 * from the wf-class-level-data compendium.
 */
export const WF_CLASS_REGISTRY = {
${entries.join(',\n')}
}
`
  await fs.writeFile(REGISTRY, body)
  console.log(`wrote ${path.relative(REPO, REGISTRY)} (${entries.length} classes)`)
}

/** Emit module/wf-fumble-data.mjs: classId -> level -> fumble die, straight from the charts. */
async function writeFumbleData (files) {
  const table = {}
  for (const file of files) {
    const chart = JSON.parse(await fs.readFile(path.join(CHARTS, file), 'utf8'))
    table[chart.classId] = Object.fromEntries(
      chart.levels.filter(l => l.fumbleDie).map(l => [l.level, l.fumbleDie])
    )
  }
  const body = `/**
 * GENERATED by tools/build_level_items.mjs from data/classes/*.json. Do not edit.
 *
 * Weird Frontiers keys the fumble die to class and level, where DCC derives it from equipped
 * armor — and WF has no armor, so DCC's derivation always yields 1d4. The value therefore
 * cannot travel in the level-data compendium: DCC overwrites it on every prepareData. It is
 * applied as an Active Effect instead (module/wf-fumble.mjs), which runs after prepareBaseData
 * and wins. These are the values that effect applies.
 */
export const FUMBLE_DICE = {
${Object.entries(table).map(([classId, levels]) =>
  `  ${key(classId)}: { ` +
  Object.entries(levels).map(([level, die]) => `${level}: '${die}'`).join(', ') +
  ' }').join(',\n')}
}

/**
 * The fumble die for a class at a level, or '' when unknown.
 *
 * @param {string} classId - lowercase-hyphenated, e.g. 'gunslinger'
 * @param {number} level
 * @returns {string}
 */
export function fumbleDieFor (classId, level) {
  return FUMBLE_DICE[classId]?.[level] ?? ''
}
`
  await fs.writeFile(FUMBLE_DATA, body)
  const classes = Object.keys(table).length
  console.log(`wrote ${path.relative(REPO, FUMBLE_DATA)} (${classes} class(es))`)
}

main().catch(err => { console.error(err); process.exit(1) })
