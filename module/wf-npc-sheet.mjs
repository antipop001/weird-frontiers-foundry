/* global game */
/* eslint-disable-next-line import/no-absolute-path */
import DCCActorSheet from '/systems/dcc/module/actor-sheet.js'
import { monsterCritDice, parseHitDice } from './wf-monster-crit-data.mjs'

/**
 * The Weird Frontiers NPC sheet (REQ-SHEET-020..023).
 *
 * WF's monster stat block is DCC's with one substitution — `AL` becomes `Path`
 * (`Weird_Frontiers_V6.md:11429`: "Init +3; Atk bite melee +3 (1d12); AC 12; HD 5d8; MV 60'
 * swimming; Act 1d20; SP crashing wave, monsoon; SV Fort +1, Ref +3, Will -1; Path POR +1.").
 * So this subclasses DCC's NPC sheet rather than replacing it, and re-points only the character
 * part at a generated fork of upstream's template.
 *
 * Everything this adds is DERIVED FOR DISPLAY and deliberately not editable. Two of the three
 * requirements are specifically about not storing values the rules already determine:
 *
 *   - **Crit and fumble dice** come from the creature's HD (REQ-SHEET-022). An editable field
 *     would drift from the chart the moment someone changed HD.
 *   - **The Grit (fear) DC** cannot be a field on the monster at all (REQ-SHEET-023): it is
 *     "DC 8 + the number of Hit Dice the creature has + any Hex tokens attached to the character
 *     making the check" (`:3229`) — it depends on WHO IS LOOKING. The sheet shows the part that
 *     belongs to the monster and names the part that does not.
 */

/**
 * Every Path a monster stat block can print, in printed order (Damned -> Righteous).
 *
 * Stored as a string on `system.details.path.code`, NOT as the player's signed position. A bare
 * `POD` is a real, common state — 24 stat blocks — and is NOT the same as Walking the Line (59):
 * the signed track has no slot for "on the Damned path, no modifier", because magnitude 0 is
 * already the line. Using `position` here would silently convert those 24 creatures to
 * line-walkers.
 *
 * `POR` bare does not appear in the bestiary but is offered for symmetry, since nothing in the
 * rules forbids it.
 *
 * The values are the codes as the book writes them, so a stat block round-trips exactly.
 */
const NPC_PATHS = [
  { value: 'POD+1d', code: 'WF.Npc.PathDamned', modifier: '+1d' },
  { value: 'POD+3', code: 'WF.Npc.PathDamned', modifier: '+3' },
  { value: 'POD+2', code: 'WF.Npc.PathDamned', modifier: '+2' },
  { value: 'POD+1', code: 'WF.Npc.PathDamned', modifier: '+1' },
  { value: 'POD', code: 'WF.Npc.PathDamned', modifier: '' },
  { value: 'WTL', code: 'WF.Npc.PathLine', modifier: '' },
  { value: 'POR', code: 'WF.Npc.PathRighteous', modifier: '' },
  { value: 'POR+1', code: 'WF.Npc.PathRighteous', modifier: '+1' },
  { value: 'POR+2', code: 'WF.Npc.PathRighteous', modifier: '+2' },
  { value: 'POR+3', code: 'WF.Npc.PathRighteous', modifier: '+3' },
  { value: 'POR+1d', code: 'WF.Npc.PathRighteous', modifier: '+1d' }
]

/**
 * The select's options.
 *
 * An ARRAY, not an object keyed by value. A plain object reorders itself — JavaScript walks
 * integer-like keys in ascending numeric order first — which scrambled an earlier version of
 * this list into WTL, the Righteous half, then the Damned half. Verified live before it changed.
 */
function pathOptions (localize) {
  return NPC_PATHS.map(p => ({
    value: p.value,
    label: `${localize(p.code)}${p.modifier ? ' ' + p.modifier : ''}`
  }))
}

/** The printed form of a stored code, or '' when nothing is set. */
function pathDisplay (value, localize) {
  const entry = NPC_PATHS.find(p => p.value === value)
  if (!entry) return ''
  return `${localize(entry.code)}${entry.modifier ? ' ' + entry.modifier : ''}`
}

export class WFNPCSheet extends DCCActorSheet {
  /** Re-point ONLY the character part; everything else stays upstream's. */
  static get PARTS () {
    return {
      ...super.PARTS,
      character: { id: 'character', template: 'modules/wfvtt/templates/actor-partial-wf-npc-common.html' }
    }
  }

  /** @inheritDoc */
  async _prepareContext (options) {
    const context = await super._prepareContext(options)
    const system = this.options.document.system
    const localize = (key) => game.i18n.localize(key)

    const pathCode = String(system?.details?.path?.code ?? '')

    // `hitDice.value` is free text ('5d8', '1d4+2', '2'), but NOT arbitrary: DCC cleans anything
    // that is not valid dice notation to '1d4' (reference/dcc/module/data/actor/base-actor.mjs:34-38).
    // Verified live — 'lots', '0', '½' and '1/2' are all stored as '1d4'.
    //
    // Two consequences. The null/unknown branch below is DEFENSIVE only, since the field cannot
    // normally hold something unparseable; and the chart's "Less than 1" row is unreachable
    // through this field, because every sub-1 notation is coerced up to 1 HD. The row is still
    // implemented, for a value arriving by another route (the NPC parser, or a module writing
    // the field directly).
    const hd = parseHitDice(system?.attributes?.hitDice?.value)
    const dice = hd === null ? null : monsterCritDice(hd)

    context.wf = {
      ...(context.wf ?? {}),
      npc: {
        path: {
          value: pathCode,
          display: pathDisplay(pathCode, localize),
          options: pathOptions(localize)
        },
        hd,
        known: hd !== null,
        critDie: dice?.crit ?? '',
        fumbleDie: dice?.fumble ?? '',
        // Only the monster's half of the Grit DC. The character's Hex tokens are added by
        // whoever makes the check — see the class docblock.
        gritDcBase: hd === null ? null : 8 + Math.floor(hd),
        // SUGGESTIONS for a free-text field, not a closed list. WF names the crit table by
        // attack type, but the same passage also allows DCC/MCC specialized charts for
        // "legendary creatures (dragons, giants, un-dead, etc.)" and encourages judges to write
        // their own (Weird_Frontiers_V6.md:11390-11392) — and a converted DCC NPC arrives with a
        // numeral like 'M'. A dropdown would lock all of that out.
        attackTypes: [
          localize('WF.Npc.AttackBlunt'),
          localize('WF.Npc.AttackPiercing'),
          localize('WF.Npc.AttackSlashing')
        ]
      }
    }
    return context
  }
}
