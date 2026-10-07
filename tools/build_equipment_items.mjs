/**
 * Generate the equipment compendium from data/equipment.json.
 *
 *   node tools/build_equipment_items.mjs      (npm run equipment)
 *
 * Melee and ranged weapons become `weapon` items; general-store goods become `equipment`
 * items, foldered by the category printed above them in the book. Ids are sha256-derived from
 * a stable seed so re-running gives a byte-identical tree.
 *
 * data/equipment.json is itself generated from the books by tools/build_equipment.py. Edit
 * neither: fix the extractor and re-run both.
 *
 * `system.damage` always holds a single valid formula. A weapon printed with an alternative
 * profile — the Halberd's `d10/d6` (slashing or piercing), the Kusari Gama's `d4/d6` — keeps
 * that string in a flag, because Foundry's Roll parses "/" as division and `d10/d6` would
 * evaluate to about 1 with no error.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(REPO, 'data', 'equipment.json')
const OUT = path.join(REPO, 'packs', 'wf-equipment', 'src')

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

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)

const table = (rows) => '<table>' + rows
  .filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== 0)
  .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escape(v)}</td></tr>`)
  .join('') + '</table>'

async function main () {
  await fs.mkdir(OUT, { recursive: true })
  const { melee, ranged, goods } = JSON.parse(await fs.readFile(DATA, 'utf8'))

  const stale = new Set(await fs.readdir(OUT).catch(() => []))
  const write = async (name, doc) => {
    stale.delete(name)
    await fs.writeFile(path.join(OUT, name), JSON.stringify(doc, null, 2) + '\n')
  }

  const folderIds = {}
  const folder = async (label, colour) => {
    const id = idFor(`wfvtt:equipment-folder:${label}`)
    folderIds[label] = id
    await write(`${slug(label)}_${id}.json`, {
      name: label,
      type: 'Item',
      color: colour,
      folder: null,
      _id: id,
      description: '',
      sorting: 'a',
      sort: 0,
      flags: {},
      _stats: STATS,
      _key: `!folders!${id}`
    })
  }

  await folder('Melee Weapons', '#5a3a2a')
  await folder('Ranged Weapons', '#5a3a2a')
  for (const category of [...new Set(goods.map(g => g.category))].sort()) {
    await folder(category || 'General Store', '#3f4a3a')
  }

  const weapon = async (w, kind) => {
    const id = idFor(`wfvtt:${kind}:${w.name}`)
    await write(`${slug(w.name)}_${id}.json`, {
      img: 'icons/svg/sword.svg',
      name: w.name,
      type: 'weapon',
      system: {
        description: {
          value: table([
            ['Damage', w.altDamage || w.damage || w.damageNote],
            ['Type', w.damageType],
            ['Range', w.range],
            ['Weight (lbs)', w.weight],
            ['Price', w.priceText],
            ['Notes', w.notes]
          ]),
          chat: '',
          unidentified: '',
          summary: '',
          judge: { value: '' }
        },
        source: 'Weird Frontiers',
        damage: w.damage,
        range: w.range ?? '',
        melee: kind === 'melee',
        trained: false,
        weight: w.weight ?? 0
      },
      flags: {
        wfvtt: {
          firearm: {
            isFirearm: false,
            // The FULL printed type, not just its first letter. A Halberd is "S/P" and really
            // does have a piercing mode ("when used as a piercing weapon attacker gains a +1d
            // bonus to attack", Reference_Guide.md:1392); WF keys crit charts to damage type,
            // so truncating to "s" would have told the system it can never crit as piercing.
            damageType: (w.damageType || '').toLowerCase(),
            // The printed alternative profile, kept out of system.damage — see the header.
            bandedDamage: w.altDamage || '',
            price: w.price,
            priceText: w.priceText
          }
        }
      },
      folder: folderIds[kind === 'melee' ? 'Melee Weapons' : 'Ranged Weapons'],
      _id: id,
      effects: [],
      sort: 0,
      ownership: { default: 0 },
      _stats: STATS,
      _key: `!items!${id}`
    })
  }

  for (const w of melee) await weapon(w, 'melee')
  for (const w of ranged) await weapon(w, 'ranged')

  const seen = new Set()
  for (const g of goods) {
    // The same name can appear in two categories at different prices (a Belt is $0.50 for
    // ladies and $0.75 for men), so the seed carries both.
    const seed = `wfvtt:goods:${g.category}:${g.name}:${g.priceText}`
    if (seen.has(seed)) { console.error(`duplicate goods seed: ${seed}`); process.exit(1) }
    seen.add(seed)
    const id = idFor(seed)
    await write(`${slug(g.name)}_${id}.json`, {
      img: 'icons/svg/item-bag.svg',
      name: g.name,
      type: 'equipment',
      system: {
        description: {
          value: table([['Price', g.priceText], ['Category', g.category]]),
          chat: '',
          unidentified: '',
          summary: '',
          judge: { value: '' }
        },
        source: 'Weird Frontiers'
      },
      flags: { wfvtt: { goods: { price: g.price, priceText: g.priceText, category: g.category } } },
      folder: folderIds[g.category || 'General Store'],
      _id: id,
      effects: [],
      sort: 0,
      ownership: { default: 0 },
      _stats: STATS,
      _key: `!items!${id}`
    })
  }

  for (const name of stale) {
    await fs.unlink(path.join(OUT, name))
    console.log(`removed stale ${name}`)
  }
  console.log(`${melee.length} melee + ${ranged.length} ranged + ${goods.length} goods, ` +
              `${Object.keys(folderIds).length} folders`)
}

main().catch(err => { console.error(err); process.exit(1) })
