#!/usr/bin/env node
/**
 * Build the Fear and Madness RollTable pack sources from data/fear_madness.json.
 *
 *     node tools/build_fear_items.mjs          # regenerate packs/wf-fear/src
 *     node tools/build_fear_items.mjs --check  # verify, change nothing
 *
 * These are NOT crit/fumble tables and are deliberately in their own pack. DCC resolves crit and
 * fumble tables by name prefix out of registered packs (`Crit Table <suffix>`,
 * `Fumble Table <suffix>`); nothing in the system looks up a Fear table, so these are ours to
 * drive and must not sit in `wf-crit-tables` where a prefix match could ever reach them.
 *
 * THE FORMULA IS THE AWKWARD PART, because the two printings disagree about whether a die is
 * rolled at all (see `fear.conflict` in the data file):
 *
 *   - V6, three times: the index IS the Grit-check failure margin, modified by Luck and Hex
 *     tokens. No die. The table is consulted with a computed total, so `formula` is never used.
 *   - The Reference Guide: "Roll 1d20 modified by" that same margin, and its column head reads
 *     `ROLL 1D20`.
 *
 * `formula` only fires when a judge clicks Roll on the table sheet, so it cannot express "look up
 * a computed number". It is set to `1d20` — the RG's printed die, and harmless under V6 where the
 * table is never rolled — and the **indexing rule and the conflict are written into the table's
 * `description`**, which is what a judge actually reads on the sheet. That keeps the artifact from
 * silently picking a side.
 *
 * Result schema notes carried over from tools/build_crit_table_items.mjs, both read off a live
 * v14 system: `type` is the STRING 'text', and the row text lives in `description`, not `text`.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA = join(REPO, 'data', 'fear_madness.json')
const OUT = join(REPO, 'packs', 'wf-fear', 'src')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const idFor = (seed) => {
  const digest = createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += ALPHABET[digest[i] % ALPHABET.length]
  if (!/^[A-Za-z0-9]{16}$/.test(id)) throw new Error(`bad id for ${seed}: ${id}`)
  return id
}

const STAMP_USER = 'wfvtt00000000000'

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

const FEAR_IMG = 'icons/magic/control/fear-fright-monster-grey.webp'
const MADNESS_IMG = 'icons/magic/control/fear-fright-shadow-monster-green.webp'

function result (tableId, seed, img, range, description) {
  const rid = idFor(seed)
  return {
    _id: rid,
    // Embedded documents are separate LevelDB entries keyed
    // `!{collection}.{embedded}!{parentId}.{embeddedId}`. Omitting `_key` fails the compile with a
    // bare "Key cannot be null or undefined" naming neither file nor document.
    _key: `!tables.results!${tableId}.${rid}`,
    flags: {},
    type: 'text',
    img,
    weight: 1,
    range,
    drawn: false,
    _stats: { ...STATS },
    description,
    name: '',
    documentUuid: null
  }
}

function table ({ id, name, img, description, formula, results }) {
  return {
    _id: id,
    name,
    flags: {},
    img,
    description,
    results,
    formula,
    replacement: true,
    displayRoll: true,
    _stats: { ...STATS },
    ownership: { default: 0 },
    folder: null,
    sort: 0,
    _key: `!tables!${id}`
  }
}

function buildFear (data) {
  const id = idFor('wfvtt-fear-table:Fear Table')
  const f = data.fear
  const description =
    '<p><strong>How to index this table.</strong> ' +
    'The Weird Frontiers core rulebook says the index <em>is</em> the amount the Grit check was ' +
    'failed by, with no die rolled: positive Luck modifiers subtract from the total and each Hex ' +
    'token adds +1. It states this three times — the Failure rule, the Critical failure rule and ' +
    'the Fear Chart introduction.</p>' +
    '<p><strong>The Reference Guide disagrees</strong>, saying &ldquo;Roll 1d20 modified by&rdquo; ' +
    'that same margin, and heads its column <em>ROLL 1D20</em>. This table ships the core ' +
    'rulebook reading; its <em>formula</em> is 1d20 only so that a manual draw works and can ' +
    'reach every row. <strong>Judge&rsquo;s call.</strong></p>' +
    '<p>Reaching zero Grit triggers the Madness table instead.</p>'
  const results = f.rows.map((row, i) =>
    result(id, `Fear Table:${row.roll}:${i}`, FEAR_IMG, [row.min, row.max], row.text))
  return table({ id, name: 'Fear Table', img: FEAR_IMG, description, formula: '1d20', results })
}

function buildMadness (data) {
  const id = idFor('wfvtt-fear-table:Madness Table')
  const m = data.madness
  const description =
    `<p><strong>Trigger.</strong> ${m.trigger}. The character suffers ${m.penalty}.</p>` +
    `<p><strong>Modifiers.</strong> ${m.modifiers}.</p>` +
    '<p><strong>The printed bands are 0-25 / 26-50 / 51-75 / 76-100.</strong> The outer two are ' +
    'open-ended here because the modifiers are flat percentages: +3 Luck is -30%, so a roll of 15 ' +
    'becomes -15, and -2 Luck with two Hex tokens is +40%, so a roll of 80 becomes 120. Entered at ' +
    'the printed bounds, both of those would fall off the table and give no result.</p>' +
    '<p><strong>The specific phobia or disorder is deliberately not random.</strong> An earlier ' +
    'draft of Weird Frontiers had a derangement chart and the author removed it, so that no ' +
    'player is handed a condition they live with. The judge and group choose how it manifests.</p>'
  const results = m.bands.map((band, i) => result(
    id, `Madness Table:${band.label}:${i}`, MADNESS_IMG,
    // The data's min/max are already open-ended at the outer bands. They have to be: the
    // modifiers are flat percentages, so +3 Luck turns a roll of 15 into -15 and two Hexes with
    // -2 Luck turn 80 into 120, and at the printed 0-25 / 76-100 both fall off the table and
    // resolve to nothing.
    [band.min, band.max],
    `<p><strong>${band.label}.</strong> ${band.text}</p>`))
  return table({ id, name: 'Madness Table', img: MADNESS_IMG, description, formula: '1d100', results })
}

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')

function coverage (doc, from, to) {
  for (let n = from; n <= to; n++) {
    const hits = doc.results.filter(r => n >= r.range[0] && n <= r.range[1]).length
    if (hits !== 1) throw new Error(`${doc.name}: index ${n} matches ${hits} rows, expected 1`)
  }
}

function main () {
  const data = JSON.parse(readFileSync(DATA, 'utf8'))
  if (data.fear.rows.length !== 30) {
    throw new Error(`expected 30 fear rows, data has ${data.fear.rows.length} — run tools/build_fear_table.py`)
  }
  const docs = [buildFear(data), buildMadness(data)]

  // Every reachable index must hit exactly one row, or a lookup silently yields nothing. The Fear
  // table is checked well below and above the printed extremes because Luck can push the total
  // negative and a large creature's HD can push it past 30.
  coverage(docs[0], -40, 60)
  // Well outside the printed 0-100, because flat percentage modifiers take it there.
  coverage(docs[1], -200, 300)

  const files = {}
  let rowTotal = 0
  for (const doc of docs) {
    rowTotal += doc.results.length
    files[`${slug(doc.name)}_${doc._id}.json`] = JSON.stringify(doc, null, 2) + '\n'
  }

  if (process.argv.includes('--check')) {
    const existing = existsSync(OUT) ? readdirSync(OUT).filter(f => f.endsWith('.json')) : []
    const expected = Object.keys(files).sort()
    if (JSON.stringify(existing.sort()) !== JSON.stringify(expected)) {
      console.error('packs/wf-fear/src is out of date — run node tools/build_fear_items.mjs')
      process.exit(1)
    }
    for (const [name, body] of Object.entries(files)) {
      if (readFileSync(join(OUT, name), 'utf8') !== body) {
        console.error(`packs/wf-fear/src/${name} is out of date — run node tools/build_fear_items.mjs`)
        process.exit(1)
      }
    }
    console.log(`ok   packs/wf-fear/src: ${docs.length} RollTables, ${rowTotal} results`)
    return
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(OUT, name), body)
  console.log(`wrote packs/wf-fear/src: ${docs.length} RollTables, ${rowTotal} results`)
}

main()
