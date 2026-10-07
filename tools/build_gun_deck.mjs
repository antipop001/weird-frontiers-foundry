#!/usr/bin/env node
/**
 * Build the Weird Frontiers Gun Deck as a Foundry Cards pack source (REQ-DECK-002).
 *
 *     node tools/build_gun_deck.mjs          # regenerate packs/wf-gun-deck/src
 *     node tools/build_gun_deck.mjs --check  # verify, change nothing
 *
 * WHY WE SHIP A DECK AT ALL. Foundry has two built-in deck presets, `pokerDark` and
 * `pokerLight`, and BOTH hold 52 cards with no jokers — verified by fetching
 * /cards/poker-deck-dark.json from a live server: four suits x values 1-13, zero joker entries.
 * Weird Frontiers needs 54: "a standard deck of playing cards (jokers included)"
 * (Weird_Frontiers_V6.md:3108), and the two jokers are the most consequential cards in the
 * system — a red Joker is an automatic critical hit plus 1d3 Boons, a black Joker an automatic
 * misfire plus 1d3 Hexes (:3112). A 52-card preset cannot express the rule at all.
 *
 * THE JOKERS ARE DISTINGUISHED IN DATA, NOT BY NAME. They do opposite things, so which is which
 * has to survive a shuffle, a round trip through LevelDB, and a non-English game. Each carries
 * `flags.wfvtt.joker` of 'red' or 'black' as well as a distinct `value`; nothing downstream
 * should ever be parsing a localized card name to decide whether a shot crit or misfired.
 *
 * Embedded documents are separate LevelDB entries keyed `!cards.cards!<deckId>.<cardId>` — the
 * same shape the RollTable pack needed, and the same bare "Key cannot be null or undefined" if
 * it is left out.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(REPO, 'packs', 'wf-gun-deck', 'src')
const ASSETS = 'modules/wfvtt/assets/cards'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const idFor = (seed) => {
  const d = createHash('sha256').update(seed).digest()
  let id = ''
  for (let i = 0; i < 16; i++) id += ALPHABET[d[i] % ALPHABET.length]
  if (!/^[A-Za-z0-9]{16}$/.test(id)) throw new Error(`bad id for ${seed}`)
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

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']
const SUIT_LABEL = { spades: 'Spades', hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs' }
// value follows the built-in poker deck: ace 1 .. king 13, so anything that already understands
// a Foundry deck keeps working. The jokers take 14 and 15, which that scheme leaves free.
const RANKS = [
  ['ace', 'Ace', 1], ['02', 'Two', 2], ['03', 'Three', 3], ['04', 'Four', 4], ['05', 'Five', 5],
  ['06', 'Six', 6], ['07', 'Seven', 7], ['08', 'Eight', 8], ['09', 'Nine', 9], ['10', 'Ten', 10],
  ['jack', 'Jack', 11], ['queen', 'Queen', 12], ['king', 'King', 13]
]

const DECK_ID = idFor('wfvtt-gun-deck')
const BACK = `${ASSETS}/back.webp`

function card (name, file, suit, value, flags = {}) {
  const id = idFor(`wfvtt-gun-deck-card:${file}`)
  return {
    _id: id,
    _key: `!cards.cards!${DECK_ID}.${id}`,
    name,
    description: '',
    type: 'base',
    system: {},
    suit,
    value,
    back: { name: '', img: BACK, text: '' },
    faces: [{ name, img: `${ASSETS}/${file}.webp`, text: '' }],
    face: 0,
    drawn: false,
    origin: null,
    width: 2,
    height: 3,
    rotation: 0,
    sort: 0,
    flags: Object.keys(flags).length ? { wfvtt: flags } : {},
    _stats: { ...STATS }
  }
}

function build () {
  const cards = []
  for (const suit of SUITS) {
    for (const [file, label, value] of RANKS) {
      cards.push(card(`${label} of ${SUIT_LABEL[suit]}`, `${suit}-${file}`, suit, value))
    }
  }
  // suit 'joker' keeps them out of any suit-based filter; the colour is the load-bearing bit.
  cards.push(card('Red Joker', 'joker-red', 'joker', 14, { joker: 'red' }))
  cards.push(card('Black Joker', 'joker-black', 'joker', 15, { joker: 'black' }))

  if (cards.length !== 54) throw new Error(`expected 54 cards, built ${cards.length}`)
  const ids = new Set(cards.map(c => c._id))
  if (ids.size !== 54) throw new Error('duplicate card ids')

  const deck = {
    _id: DECK_ID,
    _key: `!cards!${DECK_ID}`,
    name: 'Weird Frontiers Gun Deck',
    type: 'deck',
    description: '<p>A standard 54-card deck, jokers included, for the Weird Frontiers firearms ' +
      'system. Flip one card each time a character discharges a firearm.</p>',
    img: BACK,
    system: {},
    cards,
    width: 2,
    height: 3,
    rotation: 0,
    displayCount: true,
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: { wfvtt: { gunDeck: true } },
    _stats: { ...STATS }
  }
  return { 'wf-gun-deck.json': JSON.stringify(deck, null, 2) + '\n' }
}

function main () {
  const files = build()
  // Every face must exist on disk or the deck renders as broken images in the card pile.
  const deck = JSON.parse(files['wf-gun-deck.json'])
  for (const c of deck.cards) {
    const rel = c.faces[0].img.replace('modules/wfvtt/', '')
    if (!existsSync(join(REPO, rel))) throw new Error(`missing art: ${rel}`)
  }
  if (!existsSync(join(REPO, BACK.replace('modules/wfvtt/', '')))) throw new Error('missing back art')

  if (process.argv.includes('--check')) {
    const have = existsSync(OUT) ? readdirSync(OUT).filter(f => f.endsWith('.json')) : []
    if (have.length !== 1 || readFileSync(join(OUT, 'wf-gun-deck.json'), 'utf8') !== files['wf-gun-deck.json']) {
      console.error('packs/wf-gun-deck/src is out of date — run node tools/build_gun_deck.mjs')
      process.exit(1)
    }
    console.log(`ok   packs/wf-gun-deck/src: 1 deck, ${deck.cards.length} cards, all art present`)
    return
  }
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  for (const [n, body] of Object.entries(files)) writeFileSync(join(OUT, n), body)
  console.log(`wrote packs/wf-gun-deck/src: 1 deck, ${deck.cards.length} cards`)
}

main()
