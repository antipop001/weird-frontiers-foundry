#!/usr/bin/env python3
"""Regenerate templates/actor-partial-wf-npc-common.html from the DCC system's NPC partial.

WF's monster stat block is DCC's with one substitution — AL becomes Path
(Weird_Frontiers_V6.md:11429) — plus two values the rules DERIVE from Hit Dice and which
therefore must not be editable fields (REQ-SHEET-022, -023).

Same contract as the other template generators: anchored replacements, a missing anchor is a
hard failure.

    tools/build_wf_npc.py            # regenerate
    tools/build_wf_npc.py --check    # verify the committed file, change nothing
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM = REPO / 'reference' / 'dcc' / 'templates' / 'actor-partial-npc-common.html'
TARGET = REPO / 'templates' / 'actor-partial-wf-npc-common.html'

HEADER = """{{!--
  Weird Frontiers NPC (monster) stat block.

  FORKED from systems/dcc/templates/actor-partial-npc-common.html (DCC 0.70.50). Everything
  outside the marked WF blocks below is upstream's, unchanged.

  DO NOT HAND-EDIT. Regenerate with tools/build_wf_npc.py after updating reference/dcc.

    1. Alignment select     -> PATH, as the book's code      (REQ-SHEET-021)
    2. Crit Die input       -> DERIVED crit + fumble die     (REQ-SHEET-022)
    3. Crit Table input     -> attack type, not a letter     (REQ-SHEET-022)
--}}
"""

EDITS = []

EDITS.append((
    """    <div class="grid-col-span-5">
      <div class="grid-tpl-max-auto" style="column-gap: 12px;">
        <label for="system.details.alignment">{{localize "DCC.Alignment"}}</label>
        <select id="system.details.alignment" name="system.details.alignment"
                style="width: 118px; font-size: 12px; height: 17px; ">
          {{selectOptions config.alignments selected=system.details.alignment localize=true}}
        </select>
      </div>
    </div>""",
    """    {{!-- WF BLOCK 1: the Path replaces DCC's alignment (REQ-SHEET-021).
          A monster stat block prints it as a three-letter code with an optional modifier —
          "SV Fort +1, Ref +3, Will -1; Path POR +1" (Weird_Frontiers_V6.md:11429) — so this is
          a compact select of the printed codes, stored on `system.details.path.code`.

          NOT the player's signed position: a bare "Path PoD" is a real and common state (24
          stat blocks) and is NOT the same as Walking the Line (59), but the signed track has no
          slot for "Damned, no modifier" because magnitude 0 already means the line. Storing
          monsters on `position` would silently convert those 24 creatures to line-walkers.

          `system.details.alignment` still exists on the schema and is simply not shown. --}}
    <div class="grid-col-span-5">
      <div class="grid-tpl-max-auto" style="column-gap: 12px;">
        <label for="system.details.path.code" data-tooltip="{{localize 'WF.Npc.PathHint'}}">
          {{localize "WF.Path.Title"}}
        </label>
        <select id="system.details.path.code" name="system.details.path.code"
                data-dtype="String"
                style="width: 118px; font-size: 12px; height: 17px; ">
          {{selectOptions wf.npc.path.options selected=wf.npc.path.value valueAttr="value" labelAttr="label" blank=""}}
        </select>
      </div>
    </div>""",
    'alignment -> Path'))

EDITS.append((
    """        {{!-- Crit Die --}}
        <label for="system.attributes.critical.die" class="rollable" data-action="rollCritDie">{{localize "DCC.CritDie"}}</label>
        <input id="system.attributes.critical.die" name="system.attributes.critical.die"
               size="3"
               value="{{system.attributes.critical.die}}"
               data-dtype="String"
        >""",
    """        {{!-- WF BLOCK 2: crit and fumble dice are DERIVED from Hit Dice (REQ-SHEET-022).
              "Use a creature's HD to determine the appropriate die rolled for both critical
              hits and fumbles by referencing the chart below" (Weird_Frontiers_V6.md:11396).
              The chart is generated into module/wf-monster-crit-data.mjs and ratcheted against
              the book, so there is no second copy to drift.

              Shown, not stored: an editable field would go stale the moment HD changed. Note
              the two dice run OPPOSITE ways — a tougher creature crits harder and fumbles less
              badly — so they are displayed as a pair to make that visible.

              When HD does not parse, both read as unknown rather than silently showing the
              "Less than 1" row as though it were an answer. --}}
        <label data-tooltip="{{localize 'WF.Npc.CritDieHint'}}">{{localize "DCC.CritDie"}}</label>
        <div class="wf-derived">{{#if wf.npc.known}}{{wf.npc.critDie}}{{else}}&mdash;{{/if}}</div>

        {{!-- Fumble die: WF gives monsters one, DCC's NPC sheet has no field for it at all. --}}
        <label data-tooltip="{{localize 'WF.Npc.FumbleDieHint'}}">{{localize "WF.FumbleDie.Label"}}</label>
        <div class="wf-derived">{{#if wf.npc.known}}{{wf.npc.fumbleDie}}{{else}}&mdash;{{/if}}</div>

        {{!-- WF BLOCK 3: the Grit (fear) DC (REQ-SHEET-023).
              "DC 8 + the number of Hit Dice the creature has + any Hex tokens attached to the
              character making the check" (:3229). The last term belongs to whoever is looking,
              so this shows the monster's half and names the rest rather than pretending to a
              total it cannot know. Never stored. --}}
        <label data-tooltip="{{localize 'WF.Npc.GritDcHint'}}">{{localize "WF.Npc.GritDc"}}</label>
        <div class="wf-derived">{{#if wf.npc.known}}{{wf.npc.gritDcBase}}{{localize "WF.Npc.GritDcPlusHexes"}}{{else}}&mdash;{{/if}}</div>""",
    'crit die -> derived crit + fumble + Grit DC'))

EDITS.append((
    """        {{!-- Crit Table --}}
        <label for="system.attributes.critical.table">{{localize "DCC.CritTable"}}</label>
        <input id="system.attributes.critical.table" name="system.attributes.critical.table"
               size="3"
               value="{{system.attributes.critical.table}}" maxlength="5"
               data-dtype="String"
               placeholder="I"
        >""",
    """        {{!-- WF BLOCK 4: the crit TABLE is named by attack type, and stays FREE TEXT
              (REQ-SHEET-022).

              "The type of table used by the creature is determined by the attack type
              (piercing, slashing, blunt)" (Weird_Frontiers_V6.md:11392), where DCC uses a roman
              numeral by class and level.

              A closed dropdown of those three would be wrong: the
              SAME passage also lets judges use "the specialized Critical Hit charts included in
              these books for some of the more legendary creatures (dragons, giants, un-dead,
              etc.)" (:11390) and says they "are also encouraged to create their own unique
              tables for special creatures they create" (:11392). A select would also blank out
              an NPC converted from plain DCC, whose table is a numeral like "M".

              So: free text with the three attack types offered as SUGGESTIONS. Kept on
              `system.attributes.critical.table`, the field DCC already stores its numeral in, so
              nothing is added to the schema.

              The tables these name are REQ-SHEET-015 and still blocked on source material;
              recording WHICH table applies is knowable now. --}}
        <label for="system.attributes.critical.table" data-tooltip="{{localize 'WF.Npc.CritTableHint'}}">
          {{localize "DCC.CritTable"}}
        </label>
        <input id="system.attributes.critical.table" name="system.attributes.critical.table"
               size="9"
               list="wf-crit-tables"
               value="{{system.attributes.critical.table}}"
               data-dtype="String"
               placeholder="{{localize 'WF.Npc.AttackBlunt'}}"
        >
        <datalist id="wf-crit-tables">
          {{#each wf.npc.attackTypes}}<option value="{{this}}"></option>{{/each}}
        </datalist>""",
    'crit table numeral -> attack type'))


def build():
    if not UPSTREAM.exists():
        if '--check' in sys.argv:
            # Cannot compare the fork without the upstream clone. Skip loudly rather
            # than fail: someone evaluating this module may have neither the clones
            # nor the books, and should still be able to build an installable zip.
            print(f'WARN not compared against upstream — missing {UPSTREAM}')
            print('       run tools/fetch_reference.sh to enable this check')
            raise SystemExit(0)
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
            sys.exit(f'{TARGET.relative_to(REPO)} is out of date — run tools/build_wf_npc.py')
        print(f'ok   {TARGET.relative_to(REPO)} matches the generator')
        return
    TARGET.write_text(built)
    print(f'wrote {TARGET.relative_to(REPO)} ({len(built.splitlines())} lines, '
          f'{len(EDITS)} edits applied)')


main()
