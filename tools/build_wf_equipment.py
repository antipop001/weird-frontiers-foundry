#!/usr/bin/env python3
"""Regenerate the Weird Frontiers equipment templates from the DCC system's originals.

Two forks, because DCC's equipment tab pulls in its sub-partials by HARD-CODED path
(`{{> systems/dcc/templates/... }}`), so there is no way to swap one of them out without also
forking the file that includes it:

    actor-partial-pc-equipment.html  ->  actor-partial-wf-equipment.html
        - drops the ARMOR section entirely (REQ-SHEET-014)
        - re-points the goods include at our fork

    actor-partial-equipment-goods.html  ->  actor-partial-wf-goods.html
        - replaces the five DCC coin columns with one DINERO column (REQ-SHEET-004)

Same contract as tools/build_wf_common.py: every edit is an anchored replacement and a missing
anchor is a hard failure, because a silently half-patched sheet is the failure mode worth
preventing. After updating reference/dcc:

    tools/fetch_reference.sh
    tools/build_wf_equipment.py

    tools/build_wf_equipment.py --check    # verify the committed files, change nothing
"""
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
UPSTREAM_DIR = REPO / 'reference' / 'dcc' / 'templates'
TARGET_DIR = REPO / 'templates'

HEADER = """{{{{!--
  {title}

  FORKED from systems/dcc/templates/{source} (DCC 0.70.50). Everything outside
  the marked WF blocks below is upstream's, unchanged.

  DO NOT HAND-EDIT. Regenerate with tools/build_wf_equipment.py after updating reference/dcc.

{edits}
--}}}}
"""

# ---------------------------------------------------------------------------------------------
# Fork 1 — the equipment tab itself.
# ---------------------------------------------------------------------------------------------

EQUIPMENT_EDITS = []

EQUIPMENT_EDITS.append((
    """        <div>
          <a class="item-control" title="{{localize 'DCC.ItemEdit'}}" data-action="itemEdit"><i class="fas fa-edit"></i></a>
          <a class="item-control" title="{{localize 'DCC.ItemDelete'}}" data-action="itemDelete"><i class="fas fa-trash"></i></a>
        </div>""",
    """        <div>
          {{!-- WF: mark this weapon as a SIGNATURE WEAPON (REQ-SHEET-011).

                Placed inside the existing controls cell on purpose: adding a column would mean
                re-spanning every `grid-col-span-9` row in the fork, and this is a one-glance
                toggle, not a data column.

                `items.<id>.flags…` is DCC's own binding for embedded-item fields. Its
                _processFormData expands the `items.` prefix into an
                updateEmbeddedDocuments('Item', …) call
                (reference/dcc/module/actor-sheet.js:932-957), so no action handler is needed.
                DO NOT pair this with a hidden false-valued input of the same name. The usual
                HTML idiom for "an unchecked box submits nothing" is wrong here: Foundry's
                FormDataExtended already reports an unchecked named checkbox as `false`, and two
                controls sharing a name make it collect BOTH into an ARRAY. Measured live -- the
                flag became ["false","true"], which is truthy, so every weapon showed as starred
                and unchecking wrote ["false",null], still truthy. No `value` attribute either,
                so the box is read as a boolean from `.checked`. --}}
          <label class="wf-signature-toggle{{#if weapon.flags.wfvtt.signature}} wf-signature-on{{/if}}"
                 data-tooltip="{{localize 'WF.Sheet.SignatureToggle'}}">
            <input type="checkbox" name="items.{{id}}.flags.wfvtt.signature"
                   data-dtype="Boolean"
                   {{#if weapon.flags.wfvtt.signature}}checked{{/if}}>
            <i class="fas fa-star"></i>
          </label>
          <a class="item-control" title="{{localize 'DCC.ItemEdit'}}" data-action="itemEdit"><i class="fas fa-edit"></i></a>
          <a class="item-control" title="{{localize 'DCC.ItemDelete'}}" data-action="itemDelete"><i class="fas fa-trash"></i></a>
        </div>""",
    'add the signature-weapon toggle'))

EQUIPMENT_EDITS.append((
    """    {{> systems/dcc/templates/actor-partial-equipment-ammunition.html }}
    {{> systems/dcc/templates/actor-partial-equipment-armor.html }}""",
    """    {{> systems/dcc/templates/actor-partial-equipment-ammunition.html }}
    {{!-- WF BLOCK 1: no armor section (REQ-SHEET-014).
          Weird Frontiers has no MUNDANE armor: no armor table, no armor price list, nothing to
          buy or equip. Protection comes from COVER instead, adjudicated by the judge per
          situation and not tracked on the sheet: Partial +1, Half +2, Full +4
          (Weird_Frontiers_V6.md:2974-2978). The AC rule states the unarmored case as the
          general one, with no armored alternative anywhere (:2852).

          The word "armor" DOES appear in both books, and none of it is an inventory item:
            - magical and contraption armor — Golemite Armor (:5065), the Armor of Darkness
              spell (:7784) — grants a TEMPORARY AC bonus for a duration. That is an Active
              Effect, not an armor item with a static acBonus;
            - three melee weapons grant "+1d ... versus armored opponents" (Katar, Mace, Pick —
              Weird_Frontiers_Reference_Guide.md:1394, :1398, :1402). That is about NPCs being
              armored, not about player characters wearing armor;
            - monsters have natural armor in their stat blocks (e.g. chitin, :13637).

          The `armor` ITEM TYPE is deliberately left registered — this module can be installed
          in a world that also runs plain DCC characters, and removing a type from the system
          would break them. DCC's AC computation still sums equipped armor
          (reference/dcc/module/actor.js:226-243); with no way to add armor from this sheet it
          simply sums nothing. Ammunition is kept: WF firearms very much use it. --}}""",
    'drop the armor section'))

EQUIPMENT_EDITS.append((
    """    {{> systems/dcc/templates/actor-partial-equipment-goods.html }}""",
    """    {{!-- WF BLOCK 2: our fork of the goods partial, which carries Dinero instead of the
          five DCC coin fields (REQ-SHEET-004). Forked only because the include path above is
          hard-coded in upstream's template. --}}
    {{> modules/wfvtt/templates/actor-partial-wf-goods.html }}""",
    're-point the goods include'))

# ---------------------------------------------------------------------------------------------
# Fork 2 — the goods sub-partial: dollars, not coins.
# ---------------------------------------------------------------------------------------------

GOODS_EDITS = []

# The treasure list is an 8-column grid: icon, name, 5 coin columns, controls. Dropping the five
# coin columns for a single Dinero column makes it 4, so every row's span class changes with it.
GOODS_EDITS.append((
    """{{!-- End Goods Sections --}}""",
    """{{!-- WF: the published sheet's page-2 free-text areas (REQ-SHEET-011).

      Four large Text widgets with no item equivalent, mapped in
      docs/official-sheet-field-map.md: TRAIL NOTES (untitled34, 235x331), VALUABLES
      (untitled37, 141x202), ARCANE VAULT (untitled35, 268x125) and STABLE (untitled38,
      235x124 — mounts). `rows` is scaled to the printed widget heights.

      GOODS & SUNDRIES (untitled33) is the fifth page-2 widget and is deliberately absent: it
      is the only one with an item equivalent, and the list directly above IS it. A free-text
      twin would give inventory two sources of truth. --}}
<div class="wf-page2-notes">
  <div class="wf-notes-box">
    <label for="system.details.trailNotes" class="box-title"
           data-tooltip="{{localize 'WF.Sheet.TrailNotesHint'}}">
      {{localize "WF.Sheet.TrailNotes"}}
    </label>
    <textarea id="system.details.trailNotes" name="system.details.trailNotes"
              rows="10">{{system.details.trailNotes}}</textarea>
  </div>

  <div class="wf-notes-box">
    <label for="system.details.valuables" class="box-title"
           data-tooltip="{{localize 'WF.Sheet.ValuablesHint'}}">
      {{localize "WF.Sheet.Valuables"}}
    </label>
    <textarea id="system.details.valuables" name="system.details.valuables"
              rows="6">{{system.details.valuables}}</textarea>
  </div>

  <div class="wf-notes-box">
    <label for="system.details.arcaneVault" class="box-title"
           data-tooltip="{{localize 'WF.Sheet.ArcaneVaultHint'}}">
      {{localize "WF.Sheet.ArcaneVault"}}
    </label>
    <textarea id="system.details.arcaneVault" name="system.details.arcaneVault"
              rows="5">{{system.details.arcaneVault}}</textarea>
  </div>

  <div class="wf-notes-box">
    <label for="system.details.stable" class="box-title"
           data-tooltip="{{localize 'WF.Sheet.StableHint'}}">
      {{localize "WF.Sheet.Stable"}}
    </label>
    <textarea id="system.details.stable" name="system.details.stable"
              rows="5">{{system.details.stable}}</textarea>
  </div>
</div>
{{!-- End Goods Sections --}}""",
    'add the page-2 free-text areas'))

GOODS_EDITS.append((
    """  <li class="grid-col-span-8 item item-draggable" data-item-id="{{item._id}}">""",
    """  <li class="grid-col-span-4 item item-draggable" data-item-id="{{item._id}}">""",
    'treasure row span 8 -> 4'))

GOODS_EDITS.append((
    """<ol class="item-list item-list-currency box-border">
  <li class="grid-col-span-8 item-list-header">
    <div></div>
    <div>{{localize "DCC.Name"}}</div>
    <div>{{localize "DCC.CurrencyShortPP"}}</div>
    <div>{{localize "DCC.CurrencyShortEP"}}</div>
    <div>{{localize "DCC.CurrencyShortGP"}}</div>
    <div>{{localize "DCC.CurrencyShortSP"}}</div>
    <div>{{localize "DCC.CurrencyShortCP"}}</div>
    <div>
      <a class="item-create" title="{{localize 'DCC.ItemCreate'}}" data-type="treasure" data-action="itemCreate">
        <i class="fas fa-plus"></i> {{localize "DCC.Add"}}</a>
    </div>
  </li>
  <li class="grid-col-span-8 item">
    <div>
      <img src="systems/dcc/styles/images/game-icons-net/coins.svg" class="icon-filter" title="{{localize 'DCC.Funds'}}" alt="{{localize 'DCC.Funds'}}" width="22" height="22"/>
    </div>
    <div>{{localize 'DCC.Funds'}}</div>
    <input type="text" name="system.currency.pp" placeholder="0" aria-label="{{localize 'DCC.CurrencyPP'}}"
           value="{{numberFormat system.currency.pp decimals=0 sign=false}}" data-dtype="number"/>
    <input type="text" name="system.currency.ep" placeholder="0" aria-label="{{localize 'DCC.CurrencyEP'}}"
           value="{{numberFormat system.currency.ep decimals=0 sign=false}}" data-dtype="number"/>
    <input type="text" name="system.currency.gp" placeholder="0" aria-label="{{localize 'DCC.CurrencyGP'}}"
           value="{{numberFormat system.currency.gp decimals=0 sign=false}}" data-dtype="number"/>
    <input type="text" name="system.currency.sp" placeholder="0" aria-label="{{localize 'DCC.CurrencySP'}}"
           value="{{numberFormat system.currency.sp decimals=0 sign=false}}" data-dtype="number"/>
    <input type="text" name="system.currency.cp" placeholder="0" aria-label="{{localize 'DCC.CurrencyCP'}}"
           value="{{numberFormat system.currency.cp decimals=0 sign=false}}" data-dtype="number"/>
    <div></div>
  </li>""",
    """{{!-- WF BLOCK: Dinero replaces the five DCC coin fields (REQ-SHEET-004).
      Weird Frontiers money is decimal US dollars to the cent — there is no cp/sp/gp/ep/pp
      (Weird_Frontiers_Reference_Guide.md:2226-2503).

      `system.currency.pp/ep/gp/sp/cp` are NOT removed. They are DCC base-schema fields and a
      plain DCC character in the same world still needs them; this fork only stops SHOWING them,
      which is the standing rule for every DCC field this module displaces. The same
      `system.currency.dinero` field is bound on the character tab, so the two stay in step.

      The grid drops from 8 columns to 4, so the span classes on every row in this list change
      with it, and styles/wfvtt.css redefines the column widths for .wf-currency. --}}
<ol class="item-list item-list-currency wf-currency box-border">
  <li class="grid-col-span-4 item-list-header">
    <div></div>
    <div>{{localize "DCC.Name"}}</div>
    <div>{{localize "WF.Dinero.Label"}}</div>
    <div>
      <a class="item-create" title="{{localize 'DCC.ItemCreate'}}" data-type="treasure" data-action="itemCreate">
        <i class="fas fa-plus"></i> {{localize "DCC.Add"}}</a>
    </div>
  </li>
  <li class="grid-col-span-4 item">
    <div>
      <img src="systems/dcc/styles/images/game-icons-net/coins.svg" class="icon-filter" title="{{localize 'DCC.Funds'}}" alt="{{localize 'DCC.Funds'}}" width="22" height="22"/>
    </div>
    <div>{{localize 'DCC.Funds'}}</div>
    {{!-- READ-ONLY on purpose, and it must not be a form control.

          The character tab already binds an editable input to `system.currency.dinero`. Two
          controls with the SAME NAME in one form is a real hazard, not a cosmetic one: a sheet
          is a single form, the equipment part renders AFTER the character part, so on submit
          the stale equipment value would overwrite an edit just made on the character tab.
          Verified live — editing the character-tab field wrote 0 while both existed.

          `readonly` would not help: readonly inputs still submit. `disabled` would work but
          reads as a broken field, so this is a plain div and money is edited in one place. --}}
    <div class="wf-funds" data-tooltip="{{localize 'WF.Dinero.EditOnCharacterTab'}}">
      {{numberFormat system.currency.dinero decimals=2 sign=false}}
    </div>
    <div></div>
  </li>""",
    'five coin columns -> one Dinero column'))

FORKS = [
    {
        'source': 'actor-partial-pc-equipment.html',
        'target': 'actor-partial-wf-equipment.html',
        'title': 'Weird Frontiers equipment tab.',
        'edits': EQUIPMENT_EDITS,
        'notes': ['1. armor section         -> REMOVED, WF has no armor  (REQ-SHEET-014)',
                  '2. goods include         -> our fork, Dinero          (REQ-SHEET-004)'],
    },
    {
        'source': 'actor-partial-equipment-goods.html',
        'target': 'actor-partial-wf-goods.html',
        'title': 'Weird Frontiers goods sub-tab.',
        'edits': GOODS_EDITS,
        'notes': ['1. treasure row spans    -> 8 columns become 4        (REQ-SHEET-004)',
                  '2. five coin fields      -> one DINERO field          (REQ-SHEET-004)'],
    },
]


def build(fork):
    upstream = UPSTREAM_DIR / fork['source']
    if not upstream.exists():
        sys.exit(f'missing {upstream} — run tools/fetch_reference.sh first')
    text = upstream.read_text()
    for anchor, replacement, name in fork['edits']:
        n = text.count(anchor)
        if n > 1:
            sys.exit(f'AMBIGUOUS ANCHOR for edit "{name}": it matches {n} times, and only the '
                     f'FIRST would be edited — silently leaving the rest unchanged. Extend the '
                     f'anchor until it is unique.')
        if anchor not in text:
            sys.exit(f'ANCHOR NOT FOUND for edit "{name}" in {fork["source"]}.\n'
                     f'The upstream template changed. Re-read it and update the anchor in '
                     f'{pathlib.Path(__file__).name} before regenerating.')
        text = text.replace(anchor, replacement, 1)
    header = HEADER.format(title=fork['title'], source=fork['source'],
                           edits='\n'.join('    ' + n for n in fork['notes']))
    return header + text


def main():
    check = '--check' in sys.argv
    for fork in FORKS:
        built = build(fork)
        target = TARGET_DIR / fork['target']
        if check:
            current = target.read_text() if target.exists() else ''
            if current != built:
                sys.exit(f'{target.relative_to(REPO)} is out of date — '
                         f'run tools/build_wf_equipment.py')
            print(f'ok   {target.relative_to(REPO)} matches the generator')
        else:
            target.write_text(built)
            print(f'wrote {target.relative_to(REPO)} ({len(built.splitlines())} lines, '
                  f'{len(fork["edits"])} edits applied)')


main()
