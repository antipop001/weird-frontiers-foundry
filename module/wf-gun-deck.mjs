/* global Hooks, game, ui, Cards, ChatMessage, Roll, CONST, Folder, foundry */
/**
 * The Gun Deck flip and its result table (REQ-DECK-003, REQ-DECK-004).
 *
 * "The Gun deck is at the heart of the firearms system" (`Weird_Frontiers_V6.md:3108`). A card
 * is flipped for EVERY shot discharged — not every attack action: "a card from the gun deck must
 * be flipped for each shot fired, including each shot from fanning the hammer" (`:3138`), and
 * again for shots inside a gun's ROF (`:3076`). Hence `flip(actor, count)` rather than a
 * one-card-per-attack call.
 *
 * WHAT THIS AUTOMATES, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * Automated: the draw, the classification, the reshuffle when the deck runs out, and the Boon
 * and Hex awards — "the character receives 1d3 Boon tokens" is a die roll and an integer, not a
 * judgement.
 *
 * NOT automated: the fumble roll, even though the module knows the fumble die and the Luck
 * modifier and could roll it. It must not, because it cannot see the attack roll, and the rules
 * make the fumble conditional on it: a critical success drawn alongside an Ace or Eight still
 * misfires but "the Fumble chart roll does not" happen (`:3132`, REQ-DECK-007). A module that
 * rolled the fumble automatically would be wrong in exactly the case the judge most needs it to
 * be right. So the card reports the die and the modifier and says who has to decide.
 *
 * The attack and damage bonuses are likewise reported, not applied: the flip happens alongside
 * an attack this module does not own, and `dcc.rollWeaponAttack` is documented as stable but is
 * not emitted anywhere in 0.70.50, so there is nothing to hook.
 */
import { WF_CLASS_REGISTRY } from './wf-class-registry.mjs'
import { shotModifier } from './wf-firearm.mjs'

const MODULE_ID = 'wfvtt'
const PACK = `${MODULE_ID}.wf-gun-deck`
const GM_ACTION = 'wfvtt.createGunDeck'

/* -------------------------------------------- */
/*  REQ-DECK-004 — the result table             */
/* -------------------------------------------- */

/**
 * Classify one drawn card (`Weird_Frontiers_V6.md:3112`).
 *
 * Note 8 is a MISFIRE while 9 and 10 are inert — the inert run is "2,3,4,5,6,7,9, or 10", and an
 * eight is half of the dead man's hand. Transcribing that as 2-10 would quietly delete a whole
 * failure mode from the game.
 *
 * Reads the joker colour from `flags.wfvtt.joker`, never from the card name: red and black do
 * opposite things and the name is localized (REQ-DECK-002).
 *
 * @param {Card} card
 * @returns {object} the outcome, in terms the chat card and the caller can both use
 */
export function classify (card) {
  const joker = card.getFlag?.(MODULE_ID, 'joker') ?? card.flags?.[MODULE_ID]?.joker ?? null
  const base = { card: card.name, img: card.faces?.[0]?.img ?? card.img, bonus: 0, misfire: false, rollFumble: false, autoCrit: false, boons: 0, hexes: 0 }

  if (joker === 'red') {
    return { ...base, key: 'redJoker', autoCrit: true, boons: '1d3' }
  }
  if (joker === 'black') {
    return { ...base, key: 'blackJoker', misfire: true, rollFumble: true, hexes: '1d3' }
  }

  const value = Number(card.value)
  if (value === 1 || value === 8) {
    return { ...base, key: 'deadMansHand', misfire: true, rollFumble: true }
  }
  if (value >= 11 && value <= 13) {
    // Jacks +1, Queens +2, Kings +3, to attack AND damage, one-time.
    return { ...base, key: 'faceCard', bonus: value - 10 }
  }
  return { ...base, key: 'inert' }
}

/**
 * How bad each outcome is, worst last. Used only by REQ-DECK-011's "take the worse of the two".
 *
 * The order is the table's own: a red Joker is the best thing that can happen, a face card is
 * good, an inert card is nothing, a dead man's hand is a misfire, and a black Joker is a misfire
 * that also hands out Hexes — strictly worse than the Ace or Eight it otherwise resembles.
 */
const SEVERITY = ['redJoker', 'faceCard', 'inert', 'deadMansHand', 'blackJoker']
const worseOf = (a, b) => (SEVERITY.indexOf(b.key) > SEVERITY.indexOf(a.key) ? b : a)

/**
 * The cumulative penalty on a shot after the first (REQ-DECK-008).
 *
 * TWO DIFFERENT RULES, both phrased as "a cumulative penalty per shot", and conflating them is
 * the easiest mistake in this whole subsystem:
 *
 *  - firing several shots inside a gun's ROF is **-1 flat** each after the first (`:3076`);
 *  - **fanning the hammer** is **-1d** each after the first — a step down the dice chain, not a
 *    number (`:3138`);
 *  - except for a **Gunslinger**, who fans at **-1 flat** rather than -1d
 *    (`Weird_Frontiers_Reference_Guide.md:1717`; V6 says only that they "do not suffer the full
 *    -1d" at `:3138`, and the summary table at `:78` prints both figures side by side).
 *
 * Reported, never applied — the attack roll belongs to the system, not to this module.
 */
function shotPenalty (actor, index, mode) {
  if (index === 0) return null
  const gunslinger = (actor?.system?.details?.sheetClass ?? '').toLowerCase() === 'gunslinger'
  // The arithmetic lives in wf-firearm.mjs beside rofPenalty, so the Gun Deck and planVolley cannot
  // drift apart again — which is exactly how this subsystem came to ignore action dice.
  const mod = shotModifier(index, { fanning: mode === 'fanning', gunslinger })
  return { text: mod.text, diceStep: mod.diceStep }
}

/**
 * Which action die each shot is fired on, and its position WITHIN that die.
 *
 * REQ-COMBAT-002, and this corrects REQ-DECK-008. The cumulative -1 resets per action die:
 * "Each bullet fired on the same action die per round after the first shot has a cumulative -1
 * penalty … they may choose to fire single shots per action die WITHOUT the cumulative -1 penalty or
 * fire multiple shots per action die with the cumulative -1 penalty to each action die"
 * (`Weird_Frontiers_V6.md:3076`). So two action dice with two shots each is 0, -1, 0, -1 — not
 * 0, -1, -2, -3, which is what this computed before and which silently over-penalised.
 *
 * Omitting `perDie` puts every shot on one action die. That is the previous behaviour and the
 * stricter reading, so no existing caller changes meaning.
 *
 * @param {number} count
 * @param {number[]|null} perDie
 * @returns {number[]} for each shot, its 0-based index within its own action die
 */
function withinDieIndices (count, perDie) {
  if (!Array.isArray(perDie) || !perDie.length) {
    return Array.from({ length: count }, (_, i) => i)
  }
  const groups = perDie.map(n => Math.max(0, Math.trunc(Number(n) || 0))).filter(n => n > 0)
  const summed = groups.reduce((a, b) => a + b, 0)
  if (summed !== count) {
    throw new Error(`${MODULE_ID} | flip: perDie sums to ${summed} but count is ${count}. Pass ` +
      'perDie covering every shot, or omit it to put them all on one action die.')
  }
  const out = []
  for (const n of groups) for (let i = 0; i < n; i++) out.push(i)
  return out
}

/* -------------------------------------------- */
/*  REQ-DECK-001 — whose deck is whose           */
/* -------------------------------------------- */

const SCOPE_FLAG = 'gunDeckScope'
const FOLDER_FLAG = 'gunDeckFolder'

/**
 * Which deck an actor draws from.
 *
 * The book gives three different scopes and they are not interchangeable:
 *
 *  - **Per character** by default — "one deck be used for all the character's firearms"
 *    (`:3116`). Per CHARACTER, never per weapon.
 *  - **Per player** in a funnel — "where players control multiple characters, consider using one
 *    deck per player for all characters" (`:3116`). A recommendation, so it is a world setting
 *    rather than something forced on every table.
 *  - **One judge deck for ALL NPCs** — "Judges should use one Gun deck during encounters where
 *    one or more enemies use firearms" (`:3124`). One deck for every enemy in the encounter, not
 *    one per enemy, and not configurable: an NPC has no player to own a deck.
 *
 * An earlier version keyed every actor on `actor.id`, which quietly gave each NPC its own deck —
 * the opposite of what `:3124` asks for, and a sidebar full of decks after one gunfight.
 *
 * @returns {{key: string, label: string, ownership: object}}
 */
export function scopeFor (actor) {
  const gmOnly = { default: 0 }
  if (actor?.type !== 'Player') {
    return { key: 'judge', label: game.i18n.localize('WF.GunDeck.JudgeDeck'), ownership: gmOnly }
  }
  if (game.settings.get(MODULE_ID, 'deckScope') === 'player') {
    // The deck belongs to the human, not the character, so find the owning user. Fall back to
    // per-character scope for an actor nobody owns rather than piling every ownerless character
    // into one deck.
    const owner = game.users.find(u => !u.isGM && actor.testUserPermission(u, 'OWNER'))
    if (owner) {
      return {
        key: `player:${owner.id}`,
        label: game.i18n.format('WF.GunDeck.PlayerDeck', { name: owner.name }),
        ownership: { default: 0, [owner.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      }
    }
  }
  return {
    key: `actor:${actor.id}`,
    label: game.i18n.format('WF.GunDeck.DeckName', { name: actor.name }),
    // Mirror the actor's ownership: whoever can play the character can see and draw their deck.
    // Without this the deck is created GM-only and a player cannot look at their own cards.
    ownership: foundry.utils.duplicate(actor.ownership ?? gmOnly)
  }
}

/**
 * One folder for every Gun Deck, so a table of six does not bury the Cards sidebar.
 *
 * Serialised under its OWN key, not the caller's scope. The per-scope queue does not help here:
 * two DIFFERENT actors firing at the same moment have different scope keys, so they do not queue
 * behind each other, and both would find no folder and both create one.
 */
async function deckFolder () {
  return serialise('folder', async () => {
    let folder = game.folders.find(f => f.type === 'Cards' && f.getFlag(MODULE_ID, FOLDER_FLAG))
    if (!folder) {
      folder = await Folder.create({
        name: game.i18n.localize('WF.GunDeck.FolderName'),
        type: 'Cards',
        flags: { [MODULE_ID]: { [FOLDER_FLAG]: true } }
      })
    }
    return folder
  })
}

/**
 * Serialised per scope, for the same reason the managed Active Effects are: two flips arriving
 * together both find no deck and both create one, and a duplicate deck is worse than a duplicate
 * effect because the two then drift apart card by card. Keyed by scope, so two actors sharing
 * the judge deck queue behind each other and two unrelated characters do not.
 */
const inFlight = new Map()

function serialise (key, fn) {
  const previous = inFlight.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(fn)
  inFlight.set(key, next)
  next.finally(() => { if (inFlight.get(key) === next) inFlight.delete(key) })
  return next
}

const findByScope = (type, key) => game.cards.find(c =>
  c.type === type && c.getFlag(MODULE_ID, SCOPE_FLAG) === key)

/**
 * The deck and discard pile for whichever scope this actor belongs to, created on first use.
 *
 * A discard pile rather than a `drawn` flag because that is what the table does: flipped cards
 * pile up face-up until the deck is exhausted and reshuffled (`:3120`).
 */
export async function decksFor (actor) {
  const scope = scopeFor(actor)
  const existing = () => {
    const deck = findByScope('deck', scope.key)
    const discard = findByScope('pile', scope.key)
    return deck && discard ? { deck, discard, scope } : null
  }
  const have = existing()
  if (have) return have

  // PLAYERS CANNOT CREATE THESE DOCUMENTS. `CARDS_CREATE` is granted to roles 3 and 4 only
  // (Assistant GM and GM) and folder creation is GM-only, so a player whose character fires the
  // first shot of the session would hit a permission error rather than get a deck. Ask the
  // active GM's client to make it and wait for it to arrive over the socket.
  //
  // This is exactly the hole a GM-only test suite cannot see: everything passed while logged in
  // as the GM, who may create anything.
  if (!game.user.isGM) {
    if (!game.users.activeGM) throw new Error(game.i18n.localize('WF.GunDeck.NeedsGM'))
    // DCC's own GM-delegation surface rather than a bespoke socket: it already picks the single
    // active GM, warns when none is connected, and runs the handler locally for a GM caller.
    // A first attempt emitted on `module.wfvtt` from `init` and the message never arrived —
    // `game.socket` must be wired at READY, which is exactly what DCC's own module documents
    // ("game.socket is available at ready", module/socket.mjs).
    await game.dcc.socket.executeAsGM(GM_ACTION, { actorId: actor.id })
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const arrived = existing()
      if (arrived) return arrived
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    throw new Error(game.i18n.localize('WF.GunDeck.CreateTimeout'))
  }

  return createDecks(actor, scope)
}

/** GM-side creation. Serialised per scope so two simultaneous flips make one deck, not two. */
async function createDecks (actor, scope) {
  return serialise(scope.key, async () => {
    let deck = findByScope('deck', scope.key)
    let discard = findByScope('pile', scope.key)
    if (deck && discard) return { deck, discard, scope }

    const folder = await deckFolder()
    if (!deck) {
      const pack = game.packs.get(PACK)
      if (!pack) throw new Error(`${MODULE_ID} | compendium ${PACK} not found`)
      const index = await pack.getIndex()
      const source = await pack.getDocument(index.contents[0]._id)
      const data = source.toObject()
      delete data._id
      for (const c of data.cards) delete c._id
      data.name = scope.label
      data.folder = folder.id
      data.ownership = scope.ownership
      data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { [SCOPE_FLAG]: scope.key } })
      deck = await Cards.create(data)
      // "Each player should shuffle the cards before the session begins" (`:3112`) — a new deck
      // must never arrive in suit order.
      await deck.shuffle({ chatNotification: false })
    }
    if (!discard) {
      discard = await Cards.create({
        name: game.i18n.format('WF.GunDeck.DiscardName', { name: scope.label }),
        type: 'pile',
        folder: folder.id,
        ownership: scope.ownership,
        flags: { [MODULE_ID]: { [SCOPE_FLAG]: scope.key } }
      })
    }
    return { deck, discard, scope }
  })
}

/**
 * Delete the deck and pile belonging to a deleted character.
 *
 * Only character-scoped decks: a player deck outlives any one funnel character, and the judge
 * deck outlives everything.
 */
export async function cleanUpDecksFor (actorId) {
  const key = `actor:${actorId}`
  const doomed = game.cards.filter(c => c.getFlag(MODULE_ID, SCOPE_FLAG) === key)
  for (const c of doomed) await c.delete()
  return doomed.length
}

/* -------------------------------------------- */
/*  REQ-DECK-003 — the flip                     */
/* -------------------------------------------- */

/**
 * Recall every flipped card and shuffle. The one implementation behind all four triggers.
 *
 * `recall()` on a deck pulls its cards home from the discard pile; shuffling afterwards is the
 * point of the exercise, and a deck that was recalled but not shuffled would deal the same
 * sequence again.
 */
async function recycle (deck) {
  await deck.recall({ chatNotification: false })
  await deck.shuffle({ chatNotification: false })
  return deck
}

/**
 * Reshuffle on demand — REQ-DECK-005's two player-invoked triggers (`:3120`).
 *
 * > "characters can declare they are 'cleaning my gun(s)' and reshuffle their deck during a
 * > point in the game when there is downtime. You can also **spend a Boon** to reshuffle the Gun
 * > deck at any point during play."
 *
 * The difference between them is what they cost, which is the whole reason they are two rules
 * and not one: cleaning is free but wants downtime, and downtime is a judgement the table makes,
 * so nothing here polices when it is allowed. Spending a Boon works at any point *because* it
 * costs a Boon, so that one IS policed — the token is decremented, and a character with none is
 * refused rather than quietly reshuffling for free.
 *
 * The Boon spend is corroborated in the Boon list itself: "Spend a Boon at any time to allow an
 * instant reshuffle of the character's Gun deck" (`:64`, `:3203`).
 *
 * `actor` may be omitted: `scopeFor` treats a missing actor as judge scope, so `reshuffle()`
 * with no arguments reshuffles the Judge's deck, which belongs to no character. That is why this
 * does not guard on a missing actor the way `flip()` does — but every actor access below is
 * optional-chained, so asking a nonexistent character to spend a Boon refuses politely instead
 * of throwing a raw TypeError.
 *
 * @param {Actor} [actor]
 * @param {{reason: 'cleaning'|'boon'}} options
 */
export async function reshuffle (actor, { reason = 'cleaning' } = {}) {
  if (!['cleaning', 'boon'].includes(reason)) {
    throw new Error(`${MODULE_ID} | unknown reshuffle reason: ${reason}`)
  }
  const { deck } = await decksFor(actor)

  if (reason === 'boon') {
    // `actor?.` and not `actor.`: with no actor this is the Judge's deck, which has no Boons to
    // spend, so it must fall through to the refusal below rather than throw a TypeError.
    const boons = Number(actor?.system?.attributes?.boons) || 0
    if (boons < 1) {
      const message = game.i18n.localize('WF.GunDeck.NoBoon')
      ui.notifications?.warn(message)
      throw new Error(message)
    }
    await actor.update({ 'system.attributes.boons': boons - 1 })
  }

  await recycle(deck)
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="wf-gun-deck">
        <h4>${game.i18n.localize('WF.GunDeck.ReshuffleTitle')}</h4>
        <p>${game.i18n.localize(`WF.GunDeck.Reshuffle.${reason}`)}</p>
        <p class="wf-gun-remaining">${game.i18n.format('WF.GunDeck.Remaining', { n: deck.availableCards.length })}</p>
      </div>`
  })
  return { remaining: deck.availableCards.length, reason }
}

/**
 * Adjust a flip result for a GHOST-IRON — a Gunslinger's spirit-bound firearm (REQ-DECK-010).
 *
 * `Weird_Frontiers_V6.md:1387`, inside the Gunslinger's ghost-iron entry: "Pulls from the deck
 * that result in a misfire still misfire — a momentary loss of connection between the spirit and
 * the weapon causes the round to become inert and will require a round to expel the cartridge and
 * clear the jam. A Luck point may still be spent to ignore the misfire result as usual. **A Gun
 * deck draw that results in a Critical Fumble table roll is ignored and treated as a misfire
 * result instead.**"
 *
 * Three clauses, and the third is the mechanical one: the misfire stands, but the fumble chart is
 * NOT rolled — a ghost-iron jams rather than going catastrophically wrong. The Hexes a black
 * Joker brings are untouched, since they are not part of the fumble roll.
 *
 * SCOPED TO GHOST-IRONS, and that scoping was itself a correction: an earlier draft of the spec
 * read the words "as usual" as evidence of a general Luck-cancels-misfire rule and promoted it to
 * one. The phrase occurs exactly once in the book, here, and where the book does address Luck
 * against a misfire elsewhere it says the opposite — "The misfire result can not be avoided by
 * spending Luck only the corruption" (`:3680`). So the Luck clause is REPORTED for a ghost-iron
 * and asserted nowhere else.
 */
function asGhostIron (result) {
  if (!result.misfire) return result
  return { ...result, rollFumble: false, ghostIron: true, luckCancellable: true }
}

/* -------------------------------------------- */
/*  REQ-DECK-006 / -007 — attack-roll outcomes   */
/* -------------------------------------------- */

/**
 * A natural 1 on a firearm attack that already drew a SAFE card (REQ-DECK-006).
 *
 * `Weird_Frontiers_V6.md:3128`: "It would be unfair to declare a ranged attack result of a
 * natural 1 a misfire if the attacker took a flip from the Gun deck. In this case, count the
 * attack as a miss and the attacker earns a Hex token for the blunder."
 *
 * So the card has already spoken: the shot did not misfire, it simply missed, and there is no
 * fumble roll — the blunder costs a Hex instead. The Hex IS awarded here, because "earns a Hex
 * token" is an integer and not a judgement.
 *
 * This is a helper rather than a hook, and cannot be anything else: the module never sees the
 * attack roll. The caller is whoever knows the d20 came up 1.
 *
 * @param {Actor} actor
 */
export async function naturalOneAfterSafeDraw (actor) {
  if (!actor) throw new Error(`${MODULE_ID} | naturalOneAfterSafeDraw requires an actor`)
  const hexes = (Number(actor.system?.attributes?.hexes) || 0) + 1
  await actor.update({ 'system.attributes.hexes': hexes })
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="wf-gun-deck">
        <h4>${game.i18n.localize('WF.GunDeck.NaturalOneTitle')}</h4>
        <p>${game.i18n.localize('WF.GunDeck.NaturalOneBody')}</p>
        <p class="wf-gun-note">${game.i18n.format('WF.GunDeck.HexesEarned', { n: 1 })}</p>
      </div>`
  })
  return { miss: true, fumble: false, hexes }
}

/* -------------------------------------------- */
/*  REQ-DECK-009 — gunsmithing thins the deck    */
/* -------------------------------------------- */

/** Aces and eights — the dead man's hand, and the only cards gunsmithing can pull. */
const isMisfireCard = (card) => Number(card.value) === 1 || Number(card.value) === 8

/**
 * Clean a firearm: a gunsmithy check physically REMOVES misfire cards from the deck
 * (REQ-DECK-009).
 *
 * `Weird_Frontiers_V6.md:2984`: "have the player make a *gunsmithy* skill check with a standard
 * DC 5. For every multiple of 5 the check is passed by, have the player remove one Ace or Eight
 * from their gun deck before reshuffling their deck for the start of the day."
 *
 * The arithmetic is pinned by the book's own worked example rather than by parsing "passed by":
 * Zander rolling **5 removes 1** card, and a natural **20 would have pulled 4**. That is
 * `floor(total / 5)`, and it agrees with `1 + floor((total - 5) / 5)` at every value, so the two
 * readings of the sentence do not actually differ.
 *
 * This is the one rule in the subsystem that changes the deck's COMPOSITION rather than its
 * order, and it is genuinely destructive — the cards are deleted, because a Foundry `recall()`
 * would otherwise pull them straight back from anywhere they were merely moved to. `restock()`
 * puts them back for the next day.
 *
 * Note the deck holds exactly 8 misfire cards (four aces, four eights), so a perfect check
 * removes half of them and cannot empty the supply.
 *
 * @param {Actor} actor
 * @param {number} checkTotal  the gunsmithy check result
 */
export async function gunsmith (actor, checkTotal) {
  const total = Number(checkTotal)
  if (!Number.isFinite(total)) throw new Error(`${MODULE_ID} | gunsmith needs a check total`)
  const { deck } = await decksFor(actor)

  // "before reshuffling their deck for the start of the day" — pull everything home first, so
  // cards already in the discard pile are eligible to be removed too.
  await deck.recall({ chatNotification: false })

  const allowed = total < 5 ? 0 : Math.floor(total / 5)
  const candidates = deck.cards.filter(isMisfireCard)
  const removing = candidates.slice(0, allowed)
  if (removing.length) {
    await deck.deleteEmbeddedDocuments('Card', removing.map(c => c.id))
  }
  await deck.shuffle({ chatNotification: false })

  const remainingMisfires = deck.cards.filter(isMisfireCard).length
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="wf-gun-deck">
        <h4>${game.i18n.localize('WF.GunDeck.GunsmithTitle')}</h4>
        <p>${total < 5
          ? game.i18n.format('WF.GunDeck.GunsmithFailed', { total })
          : game.i18n.format('WF.GunDeck.GunsmithRemoved', { total, n: removing.length })}</p>
        <p class="wf-gun-remaining">${game.i18n.format('WF.GunDeck.MisfiresLeft', { n: remainingMisfires, size: deck.cards.size })}</p>
      </div>`
  })
  return { allowed, removed: removing.length, misfiresLeft: remainingMisfires, size: deck.cards.size }
}

/**
 * Put back everything gunsmithing pulled, restoring the deck to its full 54.
 *
 * The rule thins the deck "for the start of the day", so something has to undo it when the next
 * day comes. Cards are re-added from the compendium rather than remembered, so a deck thinned
 * across several sessions still comes back whole.
 */
export async function restock (actor) {
  const { deck } = await decksFor(actor)
  await deck.recall({ chatNotification: false })
  const pack = game.packs.get(PACK)
  const index = await pack.getIndex()
  const source = await pack.getDocument(index.contents[0]._id)

  const have = new Set(deck.cards.map(c => `${c.suit}:${c.value}`))
  const missing = source.cards
    .filter(c => !have.has(`${c.suit}:${c.value}`))
    .map(c => { const d = c.toObject(); delete d._id; return d })

  if (missing.length) await deck.createEmbeddedDocuments('Card', missing)
  await deck.shuffle({ chatNotification: false })
  return { restored: missing.length, size: deck.cards.size }
}

/**
 * Flip `count` cards for `count` shots, and report what they mean.
 *
 * @param {Actor} actor
 * @param {number} count  one card per shot fired
 * @returns {Promise<{results: object[], reshuffled: boolean, remaining: number}>}
 */
export async function flip (actor, count = 1, { mode = 'rof', drawTwo = false, ghostIron = false, perDie = null } = {}) {
  if (!actor) throw new Error(`${MODULE_ID} | flip requires an actor`)
  if (!['rof', 'fanning'].includes(mode)) {
    throw new Error(`${MODULE_ID} | unknown flip mode: ${mode}`)
  }
  // REQ-COMBAT-002: the cumulative penalty resets per action die, so a shot's penalty depends on
  // its position within its OWN die, not on its position in the volley.
  const within = withinDieIndices(count, perDie)
  const { deck, discard } = await decksFor(actor)
  const results = []
  let reshuffled = false

  for (let i = 0; i < count; i++) {
    // REQ-DECK-005 trigger 1: "you only shuffle the Gun deck once the last card has been
    // flipped". Without this the flip simply stops working after 54 shots.
    if (!deck.availableCards.length) {
      await recycle(deck)
      reshuffled = true
    }
    // REQ-DECK-011: some effects "flip two cards from the Gun deck and take the worse of the
    // two results" (`:5569`, `:7777`). BOTH cards are flipped, so both leave the deck — only
    // the outcome is discarded, not the card.
    const drawn = []
    for (let n = 0; n < (drawTwo ? 2 : 1); n++) {
      if (!deck.availableCards.length) {
        await recycle(deck)
        reshuffled = true
      }
      const [card] = await discard.draw(deck, 1, {
        how: CONST.CARD_DRAW_MODES.TOP, chatNotification: false
      })
      drawn.push(classify(card))
    }
    // Work out the rejected cards from `worst` BEFORE any ghost-iron adjustment. asGhostIron
    // returns a NEW object, so filtering `drawn` against the adjusted result matches nothing and
    // every card — including the one actually taken — ends up listed as rejected. Only reachable
    // with drawTwo and ghostIron together, which is exactly the combination the tests had not
    // tried.
    const worst = drawn.reduce(worseOf)
    const rejected = drawn.filter(d => d !== worst).map(d => d.card)
    results.push({
      ...(ghostIron ? asGhostIron(worst) : worst),
      penalty: shotPenalty(actor, within[i], mode),
      shotOnDie: within[i] + 1,
      rejected
    })
  }

  await awardTokens(actor, results)
  await postFlip(actor, results, { reshuffled, remaining: deck.availableCards.length, mode, drawTwo, ghostIron })
  return { results, reshuffled, remaining: deck.availableCards.length, mode, ghostIron }
}

/**
 * Award the Boon and Hex tokens a flip earned (REQ-SHEET-003 holds the counters).
 *
 * Rolled and applied rather than reported: "the character receives 1d3 Boon tokens" leaves
 * nothing to decide. The rolled totals are written back onto each result so the chat card can
 * show what was actually earned rather than "1d3".
 */
async function awardTokens (actor, results) {
  let boons = 0
  let hexes = 0
  for (const r of results) {
    if (r.boons) { r.boons = (await new Roll(r.boons).evaluate()).total; boons += r.boons }
    if (r.hexes) { r.hexes = (await new Roll(r.hexes).evaluate()).total; hexes += r.hexes }
  }
  if (!boons && !hexes) return
  const system = actor.system?.attributes ?? {}
  await actor.update({
    'system.attributes.boons': (Number(system.boons) || 0) + boons,
    'system.attributes.hexes': (Number(system.hexes) || 0) + hexes
  })
}

/**
 * The fumble die and the modifier a misfire calls for.
 *
 * "the attacker must immediately roll on the Firearm Fumble chart with the appropriate fumble
 * die modified by the REVERSE of any Luck modifier" (`:3112`) — reversed because lower is better
 * on a fumble chart, the same inversion REQ-SHEET-013's die already lives under.
 */
function fumbleTerms (actor) {
  const die = actor.system?.attributes?.fumble?.die || '1d4'
  const luck = Number(actor.system?.abilities?.lck?.mod) || 0
  const reversed = -luck
  const sign = reversed >= 0 ? '+' : '-'
  return { die, formula: reversed ? `${die} ${sign} ${Math.abs(reversed)}` : die, reversed }
}

async function postFlip (actor, results, { reshuffled, remaining, mode, drawTwo, ghostIron }) {
  const L = (k, d) => game.i18n.format(k, d ?? {})
  const rows = results.map(r => {
    const detail = []
    if (r.bonus) detail.push(L('WF.GunDeck.Bonus', { n: `+${r.bonus}` }))
    if (r.autoCrit) detail.push(L('WF.GunDeck.AutoCrit'))
    if (r.misfire) detail.push(L('WF.GunDeck.Misfire'))
    if (r.boons) detail.push(L('WF.GunDeck.BoonsEarned', { n: r.boons }))
    if (r.hexes) detail.push(L('WF.GunDeck.HexesEarned', { n: r.hexes }))
    if (r.penalty) detail.push(L('WF.GunDeck.ShotPenalty', { n: r.penalty.text }))
    if (r.rejected?.length) detail.push(L('WF.GunDeck.TookWorse', { cards: r.rejected.join(', ') }))
    if (r.ghostIron) detail.push(L('WF.GunDeck.GhostIronJam'))
    return `<li><img src="${r.img}" width="34" height="51" alt=""><span><strong>${r.card}</strong>
            <em>${game.i18n.localize(`WF.GunDeck.Result.${r.key}`)}</em>
            ${detail.length ? `<span class="wf-gun-detail">${detail.join(' · ')}</span>` : ''}</span></li>`
  }).join('')

  const notes = []
  if (results.some(r => r.rollFumble)) {
    const f = fumbleTerms(actor)
    notes.push(L('WF.GunDeck.FumbleNote', { formula: f.formula }))
    // REQ-DECK-007: the module cannot see the attack roll, so it cannot know whether the fumble
    // is cancelled. Say so rather than roll and be wrong.
    notes.push(L('WF.GunDeck.FumbleException'))
  }
  if (results.some(r => r.autoCrit)) notes.push(L('WF.GunDeck.CritNote'))
  if (mode === 'fanning') notes.push(L('WF.GunDeck.FanningNote'))
  if (drawTwo) notes.push(L('WF.GunDeck.DrawTwoNote'))
  if (ghostIron && results.some(r => r.ghostIron)) notes.push(L('WF.GunDeck.GhostIronNote'))
  if (reshuffled) notes.push(L('WF.GunDeck.Reshuffled'))

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="wf-gun-deck">
        <h4>${L(mode === 'fanning' ? 'WF.GunDeck.TitleFanning' : 'WF.GunDeck.Title', { n: results.length })}</h4>
        <ul class="wf-gun-cards">${rows}</ul>
        ${notes.map(n => `<p class="wf-gun-note">${n}</p>`).join('')}
        <p class="wf-gun-remaining">${L('WF.GunDeck.Remaining', { n: remaining })}</p>
      </div>`
  })
}

/** Exposed so a macro or a future attack hook can flip without importing the module. */
export function registerGunDeck () {
  game.settings.register(MODULE_ID, 'deckScope', {
    name: 'WF.Settings.DeckScope',
    hint: 'WF.Settings.DeckScopeHint',
    scope: 'world',
    config: true,
    type: String,
    choices: { character: 'WF.Settings.DeckScopeCharacter', player: 'WF.Settings.DeckScopePlayer' },
    default: 'character'
  })

  // The GM half of the delegation. Registered on dcc.ready because that is when
  // `game.dcc.socket` exists — the system wires its socket in its own ready hook.
  Hooks.once('dcc.ready', () => {
    game.dcc?.socket?.registerSocketHandler(GM_ACTION, async ({ actorId }) => {
      const actor = game.actors.get(actorId)
      if (actor) await decksFor(actor)
    })
  })

  // A character-scoped deck is meaningless once the character is gone, and the Cards sidebar
  // fills up with the decks of deleted funnel casualties otherwise. Player and judge decks are
  // deliberately left alone: they outlive any one character.
  Hooks.on('deleteActor', async (actor) => {
    if (!game.user.isGM || actor.type !== 'Player') return
    try {
      await cleanUpDecksFor(actor.id)
    } catch (err) {
      console.error(`${MODULE_ID} | failed to clean up the gun deck for ${actor.name}`, err)
    }
  })

  const module = game.modules.get(MODULE_ID)
  if (!module) return
  module.api = module.api ?? {}
  module.api.gunDeck = {
    flip,
    reshuffle,
    gunsmith,
    restock,
    naturalOneAfterSafeDraw,
    classify,
    decksFor,
    scopeFor,
    cleanUpDecksFor,
    isWFClass: (a) => Object.hasOwn(WF_CLASS_REGISTRY, (a?.system?.details?.sheetClass ?? '').toLowerCase())
  }
}
