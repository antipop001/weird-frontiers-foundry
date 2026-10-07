#!/usr/bin/env node
/**
 * Build the Weird Frontiers crit/fumble RollTable pack sources from data/crit_fumble_tables.json
 * (REQ-SHEET-015).
 *
 *     node tools/build_crit_table_items.mjs          # regenerate packs/wf-crit-tables/src
 *     node tools/build_crit_table_items.mjs --check  # verify, change nothing
 *
 * NAMING IS LOAD-BEARING. DCC resolves a crit table by PREFIX: it builds
 * `'Crit Table ' + suffix` and walks every registered pack for a table whose name starts with it
 * (`reference/dcc/module/utilities.js:294,327`). The suffix is the weapon's
 * `system.config.critTableOverride`, falling back to the actor's `attributes.critical.table`
 * (`item.js:270`) — which on a WF NPC now holds Blunt / Piercing / Slashing (REQ-SHEET-022). So
 * the tables MUST be named `Crit Table <DamageType>` and nothing else may share that prefix.
 * DCC's own tables are `Crit Table I…V`, `M`, `U`, `G`, `DR`, `DN`, so there is no collision in
 * either direction.
 *
 * THE RESULT SCHEMA WAS READ OFF A LIVE v14 SYSTEM, not guessed. Two things bite:
 *   - `type` is the STRING 'text' (the same v13+ change that made ActiveEffect `mode` a string);
 *   - the result text lives in `description`, NOT `text` — `text` was renamed and `name` is
 *     left empty.
 * Verified against `dcc-core-book.dcc-core-crits-and-fumbles` on Foundry 14.368.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA = join(REPO, 'data', 'crit_fumble_tables.json')
const OUT = join(REPO, 'packs', 'wf-crit-tables', 'src')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const idFor = (seed) => {
  const digest = createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += ALPHABET[digest[i] % ALPHABET.length]
  if (!/^[A-Za-z0-9]{16}$/.test(id)) throw new Error(`bad id for ${seed}: ${id}`)
  return id
}

const STAMP_USER = 'wfvtt00000000000'
if (!/^[A-Za-z0-9]{16}$/.test(STAMP_USER)) throw new Error('STAMP_USER must be 16 chars')

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
 * `formula` only matters when a judge draws from the table by hand: in play DCC rolls the
 * character's own crit or fumble die and looks the total up, so the table never rolls itself.
 * These are the largest dice the rules put on each chart — d30 is the 21+ HD monster crit die,
 * d14 the 0-level fumble die — so a manual draw can at least reach every row.
 */
const CRIT_FORMULA = '1d30'
const FUMBLE_FORMULA = '1d14'

const TABLES = [
  { key: 'CRITICAL HIT:BLUNT', name: 'Crit Table Blunt', kind: 'crit', img: 'icons/skills/melee/blade-tip-orange.webp' },
  { key: 'CRITICAL HIT:PIERCING', name: 'Crit Table Piercing', kind: 'crit', img: 'icons/skills/melee/strike-dagger-blood-red.webp' },
  { key: 'CRITICAL HIT:SLASHING', name: 'Crit Table Slashing', kind: 'crit', img: 'icons/skills/melee/blade-tips-triple-bent-red.webp' },
  { key: 'CRITICAL HIT:FIREARMS', name: 'Crit Table Firearms', kind: 'crit', img: 'icons/weapons/guns/gun-pistol-flintlock.webp' },
  { key: 'CRITICAL HIT:WRESTLING', name: 'Crit Table Wrestling', kind: 'crit', img: 'icons/skills/melee/unarmed-punch-fist.webp' },
  { key: 'FUMBLE:MELEE', name: 'Fumble Table Melee', kind: 'fumble', img: 'icons/svg/downgrade.svg' },
  { key: 'FUMBLE:RANGED', name: 'Fumble Table Ranged', kind: 'fumble', img: 'icons/svg/downgrade.svg' },
  { key: 'FUMBLE:FIREARMS', name: 'Fumble Table Firearms', kind: 'fumble', img: 'icons/svg/downgrade.svg' }
]

/**
 * A roll token from the book becomes an inclusive range.
 *
 * The open ends matter: "0 or less" and "0-1" are the bottom rows and a Luck penalty can push a
 * roll below them, while "30+" / "25+" are the top. DCC's own tables use -500 as the low
 * sentinel, so the same convention is used here rather than 0 — a crit roll really can come out
 * negative, and a row that stopped at 0 would simply fail to match.
 */
function rangeFor (roll) {
  const openLow = -500
  const openHigh = 500
  if (/^\d+\+$/.test(roll)) return [parseInt(roll, 10), openHigh]
  if (/^\d+$/.test(roll)) return [parseInt(roll, 10), parseInt(roll, 10)]
  const dash = roll.match(/^(\d+)-(\d+)$/)
  if (dash) return [openLow, parseInt(dash[2], 10)]
  if (/or less/i.test(roll)) return [openLow, parseInt(roll, 10) || 0]
  throw new Error(`unrecognised roll token: ${roll}`)
}

function buildTable (spec, rows) {
  const id = idFor(`wfvtt-crit-table:${spec.name}`)
  const results = rows.map((row, i) => {
    const [low, high] = rangeFor(row.roll)
    const resultId = idFor(`${spec.name}:${row.roll}:${i}`)
    return {
      _id: resultId,
      // Embedded documents are separate LevelDB entries, keyed
      // `!{collection}.{embedded}!{parentId}.{embeddedId}` — see the CLI's extract path in
      // node_modules/@foundryvtt/foundryvtt-cli/lib/package.mjs. Omitting it fails the whole
      // compile with a bare "Key cannot be null or undefined" that names neither the file nor
      // the document.
      _key: `!tables.results!${id}.${resultId}`,
      flags: {},
      type: 'text',
      img: spec.img,
      weight: 1,
      range: [low, high],
      drawn: false,
      _stats: { ...STATS },
      description: row.result,
      name: '',
      documentUuid: null
    }
  })
  return {
    _id: id,
    name: spec.name,
    flags: {},
    img: spec.img,
    description: '',
    results,
    formula: spec.kind === 'crit' ? CRIT_FORMULA : FUMBLE_FORMULA,
    replacement: true,
    displayRoll: true,
    _stats: { ...STATS },
    ownership: { default: 0 },
    folder: null,
    sort: 0,
    _key: `!tables!${id}`
  }
}

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')

function main () {
  const data = JSON.parse(readFileSync(DATA, 'utf8'))
  const files = {}
  let rowTotal = 0
  for (const spec of TABLES) {
    const rows = data.charts[spec.key]
    if (!rows) throw new Error(`missing chart ${spec.key} in ${DATA} — run tools/build_crit_tables.py`)
    const doc = buildTable(spec, rows)
    rowTotal += rows.length
    files[`${slug(spec.name)}_${doc._id}.json`] = JSON.stringify(doc, null, 2) + '\n'

    // Every roll from 0 to the chart's top must be covered by exactly one range, or a crit will
    // silently produce no result at the table.
    const top = Math.max(...doc.results.map(r => r.range[1] === 500 ? -1 : r.range[1]))
    for (let n = 0; n <= top; n++) {
      const hits = doc.results.filter(r => n >= r.range[0] && n <= r.range[1]).length
      if (hits !== 1) throw new Error(`${spec.name}: roll ${n} matches ${hits} rows, expected 1`)
    }
  }

  if (process.argv.includes('--check')) {
    const existing = existsSync(OUT) ? readdirSync(OUT).filter(f => f.endsWith('.json')) : []
    const expected = Object.keys(files).sort()
    if (JSON.stringify(existing.sort()) !== JSON.stringify(expected)) {
      console.error('packs/wf-crit-tables/src is out of date — run node tools/build_crit_table_items.mjs')
      process.exit(1)
    }
    for (const [name, body] of Object.entries(files)) {
      if (readFileSync(join(OUT, name), 'utf8') !== body) {
        console.error(`packs/wf-crit-tables/src/${name} is out of date — run node tools/build_crit_table_items.mjs`)
        process.exit(1)
      }
    }
    console.log(`ok   packs/wf-crit-tables/src: ${TABLES.length} RollTables, ${rowTotal} results`)
    return
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(OUT, name), body)
  console.log(`wrote packs/wf-crit-tables/src: ${TABLES.length} RollTables, ${rowTotal} results`)
  for (const spec of TABLES) {
    console.log(`  ${spec.name.padEnd(24)} ${data.charts[spec.key].length} rows`)
  }
}

main()
