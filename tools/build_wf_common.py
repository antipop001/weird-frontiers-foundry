#!/usr/bin/env python3
"""Regenerate templates/actor-partial-wf-common.html from the DCC system's PC common partial.

The Weird Frontiers character tab is a FORK of
`reference/dcc/templates/actor-partial-pc-common.html`, with four deliberate edits. Forking a
427-line template by hand guarantees it drifts from upstream, so instead this script applies
the edits as anchored replacements and asserts on every anchor. When the DCC system updates
that template:

    tools/fetch_reference.sh        # pull the new upstream template
    tools/build_wf_common.py        # re-apply our edits on top of it

If an anchor has moved or changed, this fails loudly rather than producing a half-patched
sheet. That is the point: a silent partial merge is the failure mode worth preventing.

    tools/build_wf_common.py --check    # verify the committed file matches, change nothing
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM = REPO / 'reference' / 'dcc' / 'templates' / 'actor-partial-pc-common.html'
TARGET = REPO / 'templates' / 'actor-partial-wf-common.html'

HEADER = """{{!--
  Weird Frontiers character tab.

  FORKED from systems/dcc/templates/actor-partial-pc-common.html (DCC 0.70.50). Everything
  outside the marked WF blocks below is upstream's, unchanged.

  DO NOT HAND-EDIT. Regenerate with tools/build_wf_common.py after updating reference/dcc.

    1. Alignment select      -> the PATH track + WtL bonus (REQ-SHEET-001, -001a)
    2. added after HP        -> GRIT, DINERO, BOONS/HEXES (REQ-SHEET-002, -004, -003)
    3. Crit Table input      -> FUMBLE DIE                (WF keys crit tables to damage type)
--}}
"""

# (anchor, replacement, human name) — every anchor must be found or we abort.
EDITS = []

EDITS.append((
    """      <div class="grid-tpl-max-auto">
        <label for="system.details.alignment">{{localize "DCC.Alignment"}}</label>
        <select id="system.details.alignment" name="system.details.alignment"
                style="width: 118px; font-size: 12px; height: 17px; ">
          {{selectOptions config.alignments selected=system.details.alignment localize=true}}
        </select>
      </div>""",
    """      {{!-- WF BLOCK 1: the Path replaces DCC's alignment (Weird_Frontiers_V6.md:618).
            Nine notches, -4..+4; sign gives the Path, magnitude gives the modifier.
            `system.details.alignment` still exists on the schema and is simply not shown. --}}
      <div class="wf-path grid-col-span-4">
        <div class="wf-path-title">{{localize "WF.Path.Title"}}</div>
        <div class="wf-path-track">
          <span class="wf-path-end">{{localize "WF.Path.Damned"}}</span>
          {{#each wf.path.track}}
          <label class="wf-path-notch{{#if this.isLine}} wf-path-line{{/if}}"
                 data-tooltip="{{#if this.isLine}}{{localize 'WF.Path.TheLineHint'}}{{else}}{{localize this.stateKey}} {{this.modifier}}{{/if}}">
            <input type="radio" name="system.details.path.position" value="{{this.position}}"
                   data-dtype="Number" {{checked this.checked}}>
            <span class="wf-path-dot"></span>
            <span class="wf-path-label">{{#if this.isLine}}{{localize "WF.Path.TheLineShort"}}{{else}}{{this.modifier}}{{/if}}</span>
          </label>
          {{/each}}
          <span class="wf-path-end">{{localize "WF.Path.Righteous"}}</span>
        </div>

        {{!-- REQ-SHEET-001a: Walking the Line has its own progression, and it is NOT the
              track. "+1 modifier at first-level when dealing with folks of any Path. They
              progress with this bonus for each level they can maintain the Line (+2 at the
              next level, +3 at the level after, and +1d caps the bonus). If at any point they
              stray from WtL, they lose this bonus and instead take the bonus from the Path
              they now follow." (Weird_Frontiers_V6.md:950)

              Two things the track cannot express, hence a separate counter and this row:
                - the bonus comes from LEVELS HELD at the Line, and the track has no notch for
                  "at the Line for three levels";
                - it applies to folks of ANY Path, where the Righteous and Damned modifiers are
                  audience-scoped (:946, :948).

              The counter is manual, like Boons and Hexes: whether a character "maintained the
              Line" across a level is a judgement about play, not something a hook can see.

              Straying LOSES the bonus rather than pausing it — "maintain" makes it an unbroken
              streak — so a character who returns to the Line starts again at +1. The count is
              not wiped automatically, because a nudged radio button should not destroy it; the
              sheet flags the broken streak and asks the user to clear it. --}}
        <div class="wf-line-row">
          <label for="system.details.path.lineLevels" data-tooltip="{{localize 'WF.Path.LineLevelsHint'}}">
            {{localize "WF.Path.LineLevels"}}
          </label>
          <input id="system.details.path.lineLevels" name="system.details.path.lineLevels"
                 value="{{system.details.path.lineLevels}}" size="2" data-dtype="Number">
          {{#if wf.path.line.active}}
          <span class="wf-line-bonus" data-tooltip="{{localize 'WF.Path.LineBonusHint'}}">
            {{wf.path.line.bonus}} {{localize "WF.Path.LineBonusScope"}}
          </span>
          {{/if}}
          {{#if wf.path.line.lost}}
          <span class="wf-line-lost" data-tooltip="{{localize 'WF.Path.LineLostHint'}}">
            {{localize "WF.Path.LineLost"}}
          </span>
          {{/if}}
        </div>
      </div>""",
    'alignment select -> Path track'))

HP_TAIL = """      <div class="grid-tpl-max-auto" style="grid-area: 3/2; font-size: 13px; margin-bottom: 0;">
        <label style="font-size: 14px; line-height: 16px;" for="system.attributes.hp.max">{{localize "DCC.Max"}}:</label>
        <input style="font-size: 14px; border-bottom: 1px solid rgba(0, 0, 0, 0.5)"
               id="system.attributes.hp.max" name="system.attributes.hp.max" value="{{system.attributes.hp.max}}" size="3" data-dtype="Number"
        >
      </div>
    </div>"""

EDITS.append((
    HP_TAIL,
    HP_TAIL[:-len("\n    </div>")] + """

      {{!-- WF BLOCK 2: Grit and Dinero.
            Grit's MAXIMUM is derived, never stored — it is (Stamina + Personality) / 2 rounded
            down, less permanent loss (Weird_Frontiers_V6.md:608, :3221, :3245). Storing it
            would go stale the moment an ability changed, and the DCC system fires no hook
            during prepareData in which to recompute it. --}}
      <div class="wf-grit grid-col-span-2">
        <div class="wf-grit-row">
          <label for="system.attributes.grit.value" data-tooltip="{{localize 'WF.Grit.Hint'}}">
            {{localize "WF.Grit.Label"}}
          </label>
          <input id="system.attributes.grit.value" name="system.attributes.grit.value"
                 value="{{system.attributes.grit.value}}" size="3" data-dtype="Number">
          <span class="wf-grit-max" data-tooltip="{{localize 'WF.Grit.MaxHint'}}">
            / {{wf.grit.max}}
          </span>
        </div>
        <div class="wf-grit-row">
          <label for="system.attributes.grit.startingTotal"
                 data-tooltip="{{localize 'WF.Grit.StartingTotalHint'}}">
            {{localize "WF.Grit.StartingTotal"}}
          </label>
          <input id="system.attributes.grit.startingTotal" name="system.attributes.grit.startingTotal"
                 value="{{system.attributes.grit.startingTotal}}" size="2" data-dtype="Number">
          {{#if wf.grit.needsSetup}}
          <span class="wf-grit-suggest"
                data-tooltip="{{localize 'WF.Grit.SuggestHint'}}">{{localize "WF.Grit.Suggest"}} {{wf.grit.suggestedTotal}}</span>
          {{/if}}
        </div>
        <div class="wf-grit-row wf-grit-loss">
          <label for="system.attributes.grit.permanentLoss"
                 data-tooltip="{{localize 'WF.Grit.PermanentLossHint'}}">
            {{localize "WF.Grit.PermanentLoss"}}
          </label>
          <input id="system.attributes.grit.permanentLoss" name="system.attributes.grit.permanentLoss"
                 value="{{system.attributes.grit.permanentLoss}}" size="2" data-dtype="Number">
        </div>
        {{#if wf.grit.retired}}
        <div class="wf-grit-retired">{{localize "WF.Grit.Retired"}}</div>
        {{/if}}
        <div class="wf-grit-row wf-dinero">
          <label for="system.currency.dinero" data-tooltip="{{localize 'WF.Dinero.Hint'}}">
            {{localize "WF.Dinero.Label"}}
          </label>
          <input id="system.currency.dinero" name="system.currency.dinero"
                 value="{{numberFormat system.currency.dinero decimals=2 sign=false}}"
                 size="6" data-dtype="Number">
        </div>

        {{!-- REQ-SHEET-003. Boon and Hex tokens sit beside Grit because each Hex raises the
              Grit-check DC. Both are MANUAL counters: they are poker chips at the table, and
              the earning rule reverses on a roll where lower is better, which is a judgement
              call no hook can make. --}}
        <div class="wf-grit-row wf-tokens">
          <label for="system.attributes.boons" data-tooltip="{{localize 'WF.Tokens.BoonsHint'}}">
            {{localize "WF.Tokens.Boons"}}
          </label>
          <input id="system.attributes.boons" name="system.attributes.boons"
                 value="{{system.attributes.boons}}" size="2" data-dtype="Number">

          <label for="system.attributes.hexes" data-tooltip="{{localize 'WF.Tokens.HexesHint'}}">
            {{localize "WF.Tokens.Hexes"}}
          </label>
          <input id="system.attributes.hexes" name="system.attributes.hexes"
                 value="{{system.attributes.hexes}}" size="2" data-dtype="Number">
        </div>

        {{!-- The four things a Hex actually does, shown only when the character has one.
              None of this is automated; these are the numbers to apply by hand. --}}
        {{#if wf.tokens.hasHexes}}
        <div class="wf-hex-effects" data-tooltip="{{localize 'WF.Tokens.HexEffectsHint'}}">
          {{localize "WF.Tokens.HexEffects"}}
          {{wf.tokens.fumblePenalty}} {{localize "WF.Tokens.HexFumble"}} ·
          {{wf.tokens.interactionPenalty}} {{localize "WF.Tokens.HexInteraction"}} ·
          {{wf.tokens.gritDcModifier}} {{localize "WF.Tokens.HexGritDc"}} ·
          {{wf.tokens.madnessModifier}} {{localize "WF.Tokens.HexMadness"}}
        </div>
        {{/if}}
      </div>
    </div>""",
    'add Grit + Dinero after HP'))

EDITS.append((
    """    {{!-- Row separators --}}""",
    """    {{!-- WF BLOCK 4: SPECIAL ABILITIES & SPELLS (REQ-SHEET-011).

          The published sheet carries one large Text widget for this (`untitled28`, 266x330,
          mapped in docs/official-sheet-field-map.md) and has NO class-specific boxes anywhere
          on the page — so a Bedlamite's derangements, a Mystic Monk's chi knacks and a
          Revelator's spells are all free text in this one area.

          Placed at grid row 13 so it lands below every upstream block rather than auto-flowing
          into a gap: the upstream grid uses explicit rows only for its separators, the last at
          row 12. Rendered as a <textarea> against a StringField, matching how DCC itself treats
          `details.languages` and `details.birthAugur` two boxes up. --}}
    <div class="wf-special-abilities" style="grid-row: 13; grid-column: 1 / span 4">
      <label for="system.details.specialAbilities" class="box-title"
             data-tooltip="{{localize 'WF.Sheet.SpecialAbilitiesHint'}}">
        {{localize "WF.Sheet.SpecialAbilities"}}
      </label>
      <textarea id="system.details.specialAbilities" name="system.details.specialAbilities"
                rows="8">{{system.details.specialAbilities}}</textarea>
    </div>

    {{!-- WF BLOCK 5: SIGNATURE WEAPONS (REQ-SHEET-011).

          Five ruled rows of WEAPON | DMG | SHOTS | RANGE on the paper sheet
          (untitled74..untitled88, mapped in docs/official-sheet-field-map.md). DERIVED from the
          weapon items rather than twenty free-text widgets: every value already exists on the
          item, so typing them again would create a second source of truth for damage that drifts
          the moment the item is edited. See signatureWeapons() in module/wf-sheet.mjs.

          Mark a weapon with the star in the weapons list. Nothing is truncated to five -- the
          paper form ran out of rows, the data has not. --}}
    <div class="wf-signature" style="grid-row: 14; grid-column: 1 / span 4">
      <div class="box-title" data-tooltip="{{localize 'WF.Sheet.SignatureHint'}}">
        {{localize "WF.Sheet.SignatureWeapons"}}
      </div>
      {{#if wf.signature.none}}
        <p class="wf-signature-empty">{{localize "WF.Sheet.SignatureEmpty"}}</p>
      {{else}}
        <ol class="wf-signature-rows">
          <li class="wf-signature-head">
            <span>{{localize "WF.Sheet.SignatureWeapon"}}</span>
            <span>{{localize "WF.Sheet.SignatureDmg"}}</span>
            <span>{{localize "WF.Sheet.SignatureShots"}}</span>
            <span>{{localize "WF.Sheet.SignatureRange"}}</span>
          </li>
          {{#each wf.signature.rows as |row|}}
            <li data-item-id="{{row.id}}">
              <span class="wf-signature-name">{{row.name}}</span>
              <span>{{row.dmg}}</span>
              <span>{{row.shots}}</span>
              <span>{{row.range}}</span>
            </li>
          {{/each}}
        </ol>
        {{#if wf.signature.overflow}}
          <p class="wf-signature-overflow">
            {{localize "WF.Sheet.SignatureOverflow" count=wf.signature.overflow rows=wf.signature.printedRows}}
          </p>
        {{/if}}
      {{/if}}
    </div>

    {{!-- Row separators --}}""",
    'add SPECIAL ABILITIES & SPELLS + SIGNATURE WEAPONS (page 1)'))

EDITS.append((
    """      {{!-- Crit Table --}}
      <label for="system.attributes.critical.table">{{localize "DCC.CritTable"}}</label>
      <input id="system.attributes.critical.table" name="system.attributes.critical.table"
             size="3"
             value="{{system.attributes.critical.table}}" maxlength="5"
             data-dtype="String"
             placeholder="I"
      >""",
    """      {{!-- WF BLOCK 3: Fumble Die replaces DCC's Crit Table.
            WF keys crit tables to DAMAGE TYPE (Blunt/Piercing/Slashing/Firearms/Wrestling,
            Weird_Frontiers_V6.md:2866), so the table belongs to the weapon, not the character —
            and the published WF sheet prints FUMBLE DIE beside CRIT DIE in its Combat box.
            The value is MANAGED (REQ-SHEET-013): DCC recomputes attributes.fumble.die from
            equipped armor on every prepareData with no config gate
            (reference/dcc/module/actor.js:76-99), and WF has no armor, so a stored value is
            always discarded. module/wf-fumble.mjs applies the correct class-and-level die as an
            Active Effect, which runs after prepareBaseData and wins. The input stays disabled
            because a typed value really would be thrown away. --}}
      <label for="system.attributes.fumble.die" data-tooltip="{{localize 'WF.FumbleDie.Broken'}}">
        {{localize "WF.FumbleDie.Label"}}
      </label>
      <input id="system.attributes.fumble.die" name="system.attributes.fumble.die"
             size="3"
             value="{{system.attributes.fumble.die}}"
             data-dtype="String"
             data-tooltip="{{localize 'WF.FumbleDie.Broken'}}"
             disabled
      >""",
    'crit table -> fumble die'))


def build():
    if not UPSTREAM.exists():
        sys.exit(f'missing {UPSTREAM} — run tools/fetch_reference.sh first')
    text = UPSTREAM.read_text()
    for anchor, replacement, name in EDITS:
        n = text.count(anchor)
        if n > 1:
            sys.exit(f'AMBIGUOUS ANCHOR for edit "{name}": it matches {n} times, and only the '
                     f'FIRST would be edited — silently leaving the rest unchanged. Extend the '
                     f'anchor until it is unique.')
        if anchor not in text:
            sys.exit(f'ANCHOR NOT FOUND for edit "{name}".\n'
                     f'The upstream template changed. Re-read {UPSTREAM.name} and update the '
                     f'anchor in {pathlib.Path(__file__).name} before regenerating.')
        text = text.replace(anchor, replacement, 1)
    return HEADER + text


def main():
    built = build()
    if '--check' in sys.argv:
        current = TARGET.read_text() if TARGET.exists() else ''
        if current != built:
            sys.exit(f'{TARGET.relative_to(REPO)} is out of date — run tools/build_wf_common.py')
        print(f'ok   {TARGET.relative_to(REPO)} matches the generator')
        return
    TARGET.write_text(built)
    print(f'wrote {TARGET.relative_to(REPO)} ({len(built.splitlines())} lines, '
          f'{len(EDITS)} edits applied)')


if __name__ == '__main__':
    main()
