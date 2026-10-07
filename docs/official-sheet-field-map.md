# The official Weird Frontiers character sheet — field map

Source: `CharacterSheet01A_REV05` (PDF title), supplied 2026-09-12. Kept **outside this repo**
at `~/WF-Stuff/CharacterSheet_FF_official_REV05.pdf` — it is copyrighted art. This file records
only the form's *structure*, which is what the VTT sheet has to reproduce.

**This is the sheet of record.** It is a **single sheet used by every class** — there are no
class-specific boxes anywhere on it. Class abilities are free text in *Special Abilities & Spells*.

> ⚠️ **Do not confuse it with `~/WF-Stuff/Obadiah Dunmore.pdf`.** That is a *custom* fillable with
> semantic field names and bedlamite-specific boxes (`mundane contraptions`, `derangements`,
> per-firearm `conceal`/`ROF`/`load`/`rt`/`ammo` columns, and a separate back sheet). An earlier
> pass through this project derived the sheet requirements from that file and concluded the
> official sheet was per-class. It is not. Anything sourced from the Obadiah sheet describes a
> fan sheet, not the published one.

Landscape, 2 pages, 64 widgets, AcroForm. Every field name is `untitledN` — the form carries no
semantic names, so fields are identified here by position.

## Page 1

| Widget | Type | Sheet label |
|---|---|---|
| `untitled1` | Text | NAME |
| `untitled2` | Text | CLASS |
| `untitled4` | Text | XP |
| `untitled3` | Text | LVL |
| `untitled5` | Text | OCCUPATION |
| `untitled6` | Text | SPEED |
| `untitled7` | Text | LUCKY/BIRTH SIGN |
| `untitled60`…`untitled66` | CheckBox ×7 | **PATH track** — see below |
| `untitled47` / `untitled16` | Text / ComboBox | STRENGTH score / modifier |
| `untitled48` / `untitled42` | Text / ComboBox | AGILITY score / modifier |
| `untitled49` / `untitled43` | Text / ComboBox | STAMINA score / modifier |
| `untitled50` / `untitled44` | Text / ComboBox | PERSONALITY score / modifier |
| `untitled51` / `untitled45` | Text / ComboBox | LUCK score / modifier |
| `untitled52` / `untitled46` | Text / ComboBox | INTELLIGENCE score / modifier |
| `untitled69` | ComboBox | REF. save (beside Agility) |
| `untitled68` | ComboBox | FORT. save (beside Stamina) |
| `untitled67` | ComboBox | WILL save (beside Personality) |
| `untitled56` | Text | HP (the playing-card motif) |
| `untitled57` | Text | ARMOR CLASS (the sheriff-star badge) |
| `untitled58` | Text | GRIT (the skull) |
| `untitled23` | ComboBox | COMBAT → INITIATIVE |
| `untitled24` | ComboBox | COMBAT → MELEE BONUS |
| `untitled25` | ComboBox | COMBAT → RANGED BONUS |
| `untitled27` | ComboBox | COMBAT → CRIT DIE |
| `untitled26` | ComboBox | COMBAT → FUMBLE DIE |
| `untitled28` | Text (266×330) | SPECIAL ABILITIES & SPELLS |
| 5 × 4 grid | Text/ComboBox | SIGNATURE WEAPONS — see below |

**SIGNATURE WEAPONS** is five rows of `WEAPON | DMG | SHOTS | RANGE`. DMG is a ComboBox, the
other three are Text:

| Row | WEAPON | DMG | SHOTS | RANGE |
|---|---|---|---|---|
| 1 | `untitled74` | `untitled59` | `untitled75` | `untitled76` |
| 2 | `untitled77` | `untitled70` | `untitled81` | `untitled83` |
| 3 | `untitled78` | `untitled71` | `untitled82` | `untitled84` |
| 4 | `untitled79` | `untitled72` | `untitled87` | `untitled85` |
| 5 | `untitled80` | `untitled73` | `untitled88` | `untitled86` |

## Page 2

| Widget | Type | Sheet label |
|---|---|---|
| `untitled33` | Text (268×328) | GOODS & SUNDIRES *(sic — the typo is in the original)* |
| `untitled34` | Text (235×331) | TRAIL NOTES |
| `untitled36` | Text | DINERO — money, in dollars |
| `untitled37` | Text (141×202) | VALUABLES |
| `untitled35` | Text (268×125) | ARCANE VAULT |
| `untitled38` | Text (235×124) | STABLE — mounts |

## The PATH track — 7 checkboxes, not 9

Printed as `DAMNED —o—o—o—(o)—o—o—o— RIGHTEOUS` with the labels
`+1d · +3 · +2 · +1 · THE LINE · +1 · +2 · +3 · +1d` (`CharacterSheet_FF.md:17-19`).

Nine labels, **seven checkboxes**: `untitled60`…`untitled66`, evenly spaced at x = 91.4, 118.1,
144.7, **169.9**, 197.3, 224.6, 252.0. The two `+1d` labels sit under the words DAMNED and
RIGHTEOUS at the extremes and have no checkbox of their own.

- `untitled63` at x = 169.9 is **THE LINE** — the centre, and the default start
  (`Weird_Frontiers_V6.md:996`: "characters begin the game by walking the line between the two
  paths"). It is also the widest widget (10.1pt vs ~7-8pt), matching the larger double circle
  printed there.
- So the track's checkable range is −3 … 0 … +3, and the `+1d` end states — which the rules do
  describe, and which require a reaffirming deed each level to keep (`Weird_Frontiers_V6.md:942`)
  — are **not** representable as a checkbox on this form. A VTT sheet should model the full
  −4 … +4 range so the `+1d` ends are expressible.

## Things the official sheet does NOT have

Worth stating explicitly, because the fan sheet does have them and they drove an earlier,
wrong version of `specs/01-actor-sheets.md`:

- **No Boons / Hexes counters.**
- **No derangements or contraptions boxes.**
- **No per-firearm Conceal / ROF / Load / Reload-time / Ammo columns.** Signature Weapons is
  just `WEAPON | DMG | SHOTS | RANGE`. The AMMO pips printed under that block are **artwork**,
  not form fields — there are only 7 checkboxes on the page and all 7 are the Path track.
- **No armor block at all** — only the ARMOR CLASS badge. Consistent with WF having no armor table.
- **No portrait field.** The ornate portrait frame on page 2 is art; no widget sits in it.
- **No back sheet** of background / personality / connections / allies / plot crumbs. That is the
  fan sheet's second page.

## Two observations for the VTT sheet

1. **Modifiers and dice are ComboBoxes, not free text** — the six ability modifiers, the three
   saves, and all five Combat values are dropdowns, as is each weapon's DMG. The paper sheet
   treats these as pick-from-a-list, which is a hint that a VTT sheet should offer the dice chain
   as a select rather than a text input.
2. **FUMBLE DIE is a first-class character field** in the Combat box, sitting right beside CRIT
   DIE. That is direct support for `REQ-SHEET-013`: WF treats the fumble die as a per-character,
   per-class value, where DCC derives it from armor.
