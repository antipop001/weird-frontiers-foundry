/* global Hooks, foundry */
/**
 * Weird Frontiers schema additions.
 *
 * Two hooks, and which one a field goes in matters:
 *  - `dcc.defineBaseActorSchema` — Player AND NPC. The Path belongs here: WF monster stat
 *    blocks carry a Path where DCC's carry an alignment (`Weird_Frontiers_V6.md:11291-11295`).
 *  - `dcc.definePlayerSchema` — Player only. Grit is here; monsters have no Grit field.
 *
 * Nothing here REMOVES a DCC field. `details.alignment` and the five coin fields stay on the
 * schema — other DCC code reads them, and a plain DCC world in the same install still needs
 * them. The WF sheet simply does not show them.
 *
 * Every NumberField is `nullable: false, required: true` on purpose: DocumentSheetV2's submit
 * pipeline cleans an emptied text input to `null` on a nullable NumberField, which then renders
 * as "NaN". Non-nullable cleans '' and null to 0 instead. (The system hit this — see the comment
 * in `reference/dcc/module/data/fields/currency-field.mjs`.)
 */

/**
 * REQ-SHEET-001 — the Path, on both actor types, in TWO representations.
 *
 * Players get the nine-notch signed track; NPCs get the stat block's code. See the comment on
 * `code` below for why one field cannot serve both.
 */
Hooks.on('dcc.defineBaseActorSchema', (schema) => {
  const { NumberField, SchemaField, StringField } = foundry.data.fields

  // A single signed position is the whole model: sign gives the Path, magnitude gives the
  // modifier. -4 = Damned +1d … 0 = THE LINE … +4 = Righteous +1d.
  //
  // Range is -4..+4 even though the printed sheet only has SEVEN checkboxes (-3..+3): the
  // `+1d` end states are real in the rules and must be held with a reaffirming deed each
  // level (`Weird_Frontiers_V6.md:942`), the form just has no box for them.
  //
  // Default 0: "characters begin the game by walking the line between the two paths"
  // (`Weird_Frontiers_V6.md:996`).
  //
  // `code` is the MONSTER representation, and it is not redundant with `position`.
  //
  // A monster stat block prints the Path as a code with an OPTIONAL modifier, and a bare code is
  // not the same state as Walking the Line. Counted case-insensitively across the bestiary:
  // `WTL` 59, bare `POD` 24, `POD +2` 11, `POD +1` 9, `POD +3` 7, `POR +3` 7, `POR +1` 3,
  // `POD +1d` 1. The signed position cannot hold a bare `POD`, because magnitude 0 already means
  // the line — so storing monsters on `position` would silently turn 24 Damned creatures into
  // line-walkers. Note the book writes both `POD` and `PoD`, `WTL` and `WtL`, so a case-sensitive
  // survey of these codes undercounts them badly.
  //
  // So: Players use `position`, NPCs use `code`. Different representations because the book
  // itself prints a nine-notch TRACK on the character sheet and a CODE in the stat block.
  schema.details.fields.path = new SchemaField({
    position: new NumberField({
      initial: 0, integer: true, min: -4, max: 4, nullable: false, required: true
    }),
    code: new StringField({
      initial: '', blank: true, nullable: false, required: true, trim: true
    })
  })
})

/** REQ-SHEET-002 (Grit) and REQ-SHEET-004 (Dinero) — Player only. */
Hooks.on('dcc.definePlayerSchema', (schema) => {
  const { BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields

  // Grit = (Stamina + Personality) / 2, rounded down (`Weird_Frontiers_V6.md:608`, `:3221`).
  //
  // `startingTotal` is STORED, not derived, and this is the whole point: WF gives Grit a fixed
  // cap set at character creation — "the character's Grit total improves by +1 but cannot exceed
  // its starting score" (`:3233`) and "Characters regain Grit up to their original starting
  // total at the end of each adventure" (`:3245`).
  //
  // An earlier version of this file derived the cap from the CURRENT ability scores. That was
  // wrong, and wrong in a way that would have quietly punished play: most WF classes pay for
  // abilities in temporary Personality, so every spell-like ability would have shrunk the
  // character's Grit pool. The rule that tracks the current score is about SAVING THROWS
  // specifically — "saving throw bonuses change to reflect the current temporary ability score"
  // (`:984`) — and does not generalise to Grit.
  //
  // `permanentLoss` accumulates separately: an adventure in which Grit reached 0 costs 1
  // permanent Grit (`:3245`, `:3247`). The effective maximum is `startingTotal - permanentLoss`,
  // computed for display in `wf-sheet.mjs`; a character whose effective maximum reaches 0 is
  // retired (`:3251`).
  // REQ-SHEET-001a — levels maintained at the Line. PLAYER ONLY: it counts character levels,
  // which monsters do not have, and their Path is a printed code anyway.
  //
  // `Weird_Frontiers_V6.md:950`: "Characters that can successfully keep centered in their
  // attitude are rewarded by a +1 modifier at first-level when dealing with folks of any Path.
  // They progress with this bonus for each level they can maintain the Line (+2 at the next
  // level, +3 at the level after, and +1d caps the bonus). If at any point they stray from WtL,
  // they lose this bonus and instead take the bonus from the Path they now follow."
  //
  // This is a SECOND counter, not the track position. Position 0 says the character is at the
  // Line; this says how long they have held it, and the two are independent — the track has no
  // notch that can express "at the Line for three levels".
  //
  // Capped at 4 because "+1d caps the bonus": 1 -> +1, 2 -> +2, 3 -> +3, 4 -> +1d. Counting
  // past the cap would imply a progression the rule explicitly ends.
  //
  // Added to the `path` SchemaField built by the base hook, the same way `currency.dinero` is
  // added to DCC's CurrencyField — mutating `.fields` on an already-constructed SchemaField is
  // the pattern this module already relies on in production.
  schema.details.fields.path.fields.lineLevels = new NumberField({
    initial: 0, integer: true, min: 0, max: 4, nullable: false, required: true
  })

  schema.attributes.fields.grit = new SchemaField({
    value: new NumberField({ initial: 0, integer: true, min: 0, nullable: false, required: true }),
    startingTotal: new NumberField({ initial: 0, integer: true, min: 0, nullable: false, required: true }),
    permanentLoss: new NumberField({ initial: 0, integer: true, min: 0, nullable: false, required: true }),
    // REQ-FEAR-007. Permanent erosion is spent at the END of the adventure, not when zero is
    // reached: "Characters regain Grit up to their original starting total at the end of each
    // adventure, UNLESS the character was reduced to a Grit score of zero during the current
    // adventure. If this is the case, the character's Grit total is permanently reduced by 1"
    // (`Weird_Frontiers_V6.md:3245`). So hitting zero has to be remembered until then, and an
    // adventure is "1-4 sessions … an entire module" — nothing Foundry knows can infer it. This
    // flag is what `endAdventure()` spends; a BooleanField rather than a counter because the
    // penalty is 1 per adventure however many times the character bottomed out.
    reachedZero: new BooleanField({ initial: false, nullable: false, required: true })
  })

  // REQ-SHEET-003 — Boon and Hex tokens. PLAYER ONLY, and that is explicit canon, not an
  // inference: "The author recommends that judges keep Boons and Hexes exclusive to players and
  // not use the mechanic with the enemies the group faces" (`Weird_Frontiers_V6.md:3193`).
  //
  // Earned on a natural 20 and a natural 1 respectively, reversing on a roll where lower is
  // better (`Weird_Frontiers_V6.md:3199`, `:3209`). They are physical poker chips at the table
  // and are NOT auto-awarded here: the reversal is a judgement call about what the roll was
  // for, and awarding on every nat 1/20 would need to hook every roll in the system. Manual
  // counters, like the chips.
  //
  // Boons are spent freely — +1d to attack and damage, a Gun Deck reshuffle, clearing a Hex
  // 1:1, a reroll (never a fumble), +1d or -1d on any roll, or +1d to an ally (`:3203`).
  //
  // Hexes are the reason this is not just decoration: each one is an input to four other
  // rules (`:3211`) — +1d on any fumble chart, -1d on NPC interaction, +1 to the Grit-check DC
  // and +10% on Madness. `wf-sheet.mjs` derives those four so a player can read them off
  // rather than recompute them each time.
  schema.attributes.fields.boons = new NumberField({
    initial: 0, integer: true, min: 0, nullable: false, required: true
  })
  schema.attributes.fields.hexes = new NumberField({
    initial: 0, integer: true, min: 0, nullable: false, required: true
  })

  // REQ-SHEET-011 — the official sheet's five free-text areas.
  //
  // `CharacterSheet01A_REV05` carries five large Text widgets that have no item or stat
  // equivalent, mapped in `docs/official-sheet-field-map.md`: SPECIAL ABILITIES & SPELLS on
  // page 1 (`untitled28`, 266x330 — the sheet has no class-specific boxes anywhere, so every
  // class ability is free text here), and on page 2 TRAIL NOTES (`untitled34`), VALUABLES
  // (`untitled37`), ARCANE VAULT (`untitled35`) and STABLE (`untitled38`, mounts).
  //
  // StringField rendered as a <textarea>, deliberately matching DCC's own treatment of
  // `details.languages` and `details.birthAugur` rather than DCC's `details.notes.value`
  // HTMLField. HTMLField would need a ProseMirror editor and an enrichment pass for five boxes
  // whose paper originals are ruled lines; these are notes, not documents.
  //
  // GOODS & SUNDRIES (`untitled33`) is deliberately NOT here: it is the one page-2 area that
  // does have an item equivalent, and the Goods tab already is it. Adding a free-text twin
  // would give inventory two sources of truth.
  for (const field of ['specialAbilities', 'trailNotes', 'valuables', 'arcaneVault', 'stable']) {
    schema.details.fields[field] = new StringField({
      initial: '', blank: true, nullable: false, required: true
    })
  }

  // WF money is decimal US dollars to the cent (`Weird_Frontiers_Reference_Guide.md:2226-2503`);
  // there is no cp/sp/gp/ep/pp. Deliberately NOT `integer: true`. `currency` is a
  // CurrencyField, which extends SchemaField, so its `.fields` accepts an addition.
  schema.currency.fields.dinero = new NumberField({
    initial: 0, min: 0, nullable: false, required: true
  })
})
