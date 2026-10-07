/**
 * Generate the firearms compendium source from data/firearms.json.
 *
 *   node tools/build_firearm_items.mjs      (npm run firearms)
 *
 * Writes packs/wf-firearms/src/ — one `weapon` Item per gun, plus a folder per category.
 * Ids are sha256-derived from a stable seed, so re-running gives a byte-identical tree.
 *
 * The data file is itself generated, from the books, by tools/build_firearms.py. Edit neither
 * this output nor that file by hand: fix the extractor and re-run both.
 *
 * `system.damage` always holds a single valid Foundry formula. The banded shotgun profile and
 * any second-barrel profile go in flags, never here — Foundry's Roll parses "/" as division, so
 * "d14/d10/d7" would evaluate to 1d14 / 1d10 / 1d7 and total about 1, with no error.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(REPO, 'data', 'firearms.json')
const OUT = path.join(REPO, 'packs', 'wf-firearms', 'src')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const idFor = (seed) => {
  const digest = createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += ALPHABET[digest[i] % ALPHABET.length]
  if (!/^[A-Za-z0-9]{16}$/.test(id)) throw new Error(`bad id for ${seed}: ${id}`)
  return id
}

// Exactly 16 alphanumeric characters — Foundry validates this as a document id, and a 15-char
// value fails every document in the pack and hangs world load with nothing in the server log.
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

const FOLDERS = {
  revolver: { label: 'Revolvers & Pistols', colour: '#6b4423' },
  derringer: { label: 'Derringers', colour: '#6b4423' },
  rifle: { label: 'Rifles & Carbines', colour: '#4a3b2a' },
  shotgun: { label: 'Shotguns', colour: '#4a3b2a' }
}

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A short printed-stats summary, so the gun reads correctly without opening the Firearm tab. */
function describe (gun) {
  const rows = [
    ['Caliber', gun.caliber],
    ['Type', gun.actionType],
    ['Ammo', gun.ammo],
    ['Damage', gun.bandedDamage || gun.damage],
    ['ROF', gun.rof],
    ['Load', gun.load],
    ['Reload time', gun.reloadTime],
    ['Range', gun.range],
    ['Conceal', gun.conceal > 0 ? `+${gun.conceal}` : String(gun.conceal)],
    ['Price', gun.priceText],
    ['Year', gun.year],
    ['Second barrel', gun.secondBarrelDamage],
    ['Melee', gun.meleeNote]
  ].filter(([, value]) => value !== '' && value !== undefined && value !== null)

  return '<table>' + rows
    .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escape(v)}</td></tr>`)
    .join('') + '</table>'
}

async function main () {
  await fs.mkdir(OUT, { recursive: true })
  const { guns, source } = JSON.parse(await fs.readFile(DATA, 'utf8'))
  if (!Array.isArray(guns) || guns.length === 0) {
    console.error(`${path.relative(REPO, DATA)} has no guns — run tools/build_firearms.py`)
    process.exit(1)
  }

  const stale = new Set(await fs.readdir(OUT).catch(() => []))
  const write = async (name, doc) => {
    stale.delete(name)
    await fs.writeFile(path.join(OUT, name), JSON.stringify(doc, null, 2) + '\n')
  }

  const folderIds = {}
  for (const [kind, { label, colour }] of Object.entries(FOLDERS)) {
    const id = idFor(`wfvtt:firearm-folder:${kind}`)
    folderIds[kind] = id
    await write(`${label.replace(/[^A-Za-z0-9]+/g, '_')}_${id}.json`, {
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

  const seen = new Set()
  for (const gun of guns) {
    // Seed on name + caliber: the book lists two "Colt Frontier" rows (.32 and .44), so the
    // name alone is not unique.
    const seed = `wfvtt:firearm:${gun.name}:${gun.caliber}`
    if (seen.has(seed)) {
      console.error(`duplicate gun seed: ${seed}`)
      process.exit(1)
    }
    seen.add(seed)

    const id = idFor(seed)
    const slug = `${gun.name} ${gun.caliber}`.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
    await write(`${slug}_${id}.json`, {
      img: 'icons/svg/sword.svg',
      name: gun.caliber ? `${gun.name} (${gun.caliber})` : gun.name,
      type: 'weapon',
      system: {
        description: { value: describe(gun), chat: '', unidentified: '', summary: '', judge: { value: '' } },
        source: 'Weird Frontiers',
        damage: gun.damage,
        range: gun.range,
        melee: false,
        trained: false,
        twoHanded: gun.kind === 'rifle' || gun.kind === 'shotgun'
      },
      flags: {
        wfvtt: {
          firearm: {
            isFirearm: true,
            caliber: gun.caliber,
            actionType: gun.actionType,
            ammo: gun.ammo,
            rof: gun.rof,
            load: gun.load,
            reloadTime: gun.reloadTime,
            conceal: gun.conceal,
            year: gun.year,
            price: gun.price,
            priceText: gun.priceText,
            bandedDamage: gun.bandedDamage,
            secondBarrelDamage: gun.secondBarrelDamage,
            meleeNote: gun.meleeNote,
            damageType: ''
          }
        }
      },
      folder: folderIds[gun.kind],
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
  console.log(`${guns.length} firearms + ${Object.keys(FOLDERS).length} folders ` +
              `from ${source.primary}`)
}

main().catch(err => { console.error(err); process.exit(1) })
