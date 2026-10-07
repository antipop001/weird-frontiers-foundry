# Weird Frontiers → DCC mechanics delta

Produced 2026-09-12 from the corpus. **Scoping document, not a rules summary** — every claim
carries a `file:line` so it can be re-found, but a value only becomes shippable once it has been
through review with the rule text quoted verbatim.

**File shorthand** (all in your corpus directory):
`V6` = `Weird_Frontiers_V6.md` · `RG` = `Weird_Frontiers_Reference_Guide.md` ·
`DS` = `Dog_Soldier.md` · `GF` = `Gold_Fever_Comes_to_Owl_Creek!.md` ·
`DCC` = `DCCRPG_Corebook_10thPrint_screenRes_Complete_links2.md`.
System model refs are into `reference/dcc/module/data/`.

> **Sourcing rule, learned the hard way:** V6's pdf2md pass collapses every firearms and livery
> table into one crammed header row. **Build compendium data from `RG`; use `V6` for prose rules
> only.** Compare `RG:1439-1587` (clean) against `V6:15674-16203` (destroyed).

Tags: **[NEW]** no DCC equivalent · **[CHANGED]** DCC has it, WF alters it · **[SAME]** inherited
verbatim, no module work.

---

## 1. Character classes — 12 core + 1 supplement · [NEW ×13]

**No DCC class survives.** All thirteen are new. Each shares the DCC-shaped column set (attack /
crit die / fumble die / action dice / Ref / Fort / Will) **plus one signature die or percentage
track**.

| Class | HD | Crit/Fumble @1 | Wealth | Signature subsystem | Progression chart |
|---|---|---|---|---|---|
| Bedlamite | d8 `V6:1012` | d6 / d12 `V6:1014` | 2d12 `V6:1028` | Contraptions + **Derangement %** (40%→85%) | `V6:1082-1094` (+ contraption count `V6:1096-1110`) |
| Calavera | d8 `V6:1119` | d8 / d12 `V6:1121` | 1d12 `V6:1133` | Spell-like abilities, Personality cost | `V6:1162-1174` |
| Gambler | d8 `V6:1239` | d8 / d12 `V6:1241` | **1d24** `V6:1253` | **Mojo die** (+d3→+d16), regenerates Luck `V6:1247`, `V6:3185` | `V6:1312-1324` |
| Gunslinger | d10 `V6:1343` | d10 / d12 `V6:1345` | 1d12 `V6:1359` | **Deadeye die** + **crit threat range** (19-20→17-20); **no attack-bonus column at all** | `V6:1405-1417` |
| Hellbilly | **d12** `V6:1536` | d10 / d12 `V6:1538` | 1d8, or 1d30 in hooch `V6:1550` | **Ballad die** (d3→d16), Magic Jug `V6:1599` | `V6:1586-1598` |
| Luchador | **d12** `V6:1651` | d10 / d12 `V6:1653` | 1d8 `V6:1669` | **Lucha die** + **Battle Hardened** (unarmed 1d8→1d16) + **Fame %** (35%→100%) | `V6:1762-1774` |
| Mountebank | d6 `V6:1945` | d6 / d12 `V6:1947` | 1d12 `V6:1957` | Brew check; known/active formulae chart | `V6:1973-1985` (+ formulae `V6:1987+`) |
| Mystic Monk | d10 `V6:2053` | d10 / d12 `V6:2055` | 1d8 (OCR reads "rd8") `V6:2059` | **Chi die** + **Living Weapon** (1d5→1d14) | `V6:2089-2107` |
| Occultist | d6 `V6:2211` | d6 / d12 `V6:2213` | 2d12 `V6:2223` | Spell check + spellburn + patrons | `V6:2259-2271` (+ spells `V6:2274-2288`) |
| Revelator | d8 `V6:2352` | d8 / d12 `V6:2354` | 1d8 `V6:2368` | Miracles, **Fall From Grace** threshold, Turn Back the Night | `V6:2457-2469` (+ miracles `V6:2471+`) |
| Sin-Eater | d10 `V6:2498` | d8 / d12 `V6:2500` | 1d12 `V6:2512` | River Rites, **soul-aegis** (must occupy 1 of 2 signature slots) | `V6:2544-2556` |
| Tommyknocker | **d14** `V6:2618` | d8 / d12 `V6:2620` | 1d8 `V6:2630` | Dark Inheritance list, undead traits | `V6:2658-2670` |
| **Dog Soldier** (supplement) | d10 `DS:19` | d10 / **d8** `DS:21` | 2d6 `DS:5` | **Creed die** (d3→d16), sacred arrows, dog rope vow | `DS:60-72` |

- Action dice follow DCC's shape (`1d20` → `1d20+1d14` → … → `1d24+1d20+1d14`) — maps onto
  `attributes.actionDice.options` unchanged. **[SAME]**
- Save progressions are per-class tables exactly like DCC's. **[SAME shape, new numbers]**
- Sin-eater and tommyknocker are gated on a **dead** funnel character `V6:2506`, `V6:2614`. **[NEW]**
- Class **titles** run only to 6th level, then player-chosen `V6:998`. **[CHANGED]** — DCC's
  titles are alignment-keyed; WF's are not. (Relevant: the `level` Item's
  `levelDataLawful/Neutral/Chaotic` split has no WF meaning.)

---

## 2. Attributes & derived stats

| Thing | Status | Detail |
|---|---|---|
| Six abilities Str/Agl/Sta/Per/Int/Lck | **[SAME]** | `V6:604` — identical names to DCC's `str,agl,sta,per,int,lck` |
| 3d6 in order, mod table −3…+3, bonus languages | **[SAME]** | `V6:602`, `V6:642-662` |
| Dice chain d3…d30 | **[SAME]** | `V6:534` |
| **Grit** | **[NEW]** | `(Sta + Per) / 2` rounded down `V6:608`, `V6:3221`. Fluctuating pool; permanent erosion on hitting 0 `V6:3247`; permanent 0 retires the character `V6:3251`. **No DCC field — needs a current/max resource plus the erosion rule.** |
| **AC** | **[CHANGED]** | `10 + Agility mod`, **plus a cumulative +1 per character level** `V6:2852`. DCC has no level-based AC. Turn `config.computeAC` off or override the formula. |
| **Armor** | **[NEW — by removal]** | **No armor table exists anywhere in either book.** DCC's `armor-data.mjs` (`acBonus`/`checkPenalty`/`speed`/`fumbleDie`) has no WF counterpart. Cover replaces it: Partial +1 / Half +2 / Full +4 `V6:2974-2978`. Repurpose or hide the `armor` item type. |
| **Fumble die source** | **[CHANGED]** | Per-class and level, **not** armor-derived `V6:2884`. Compare `DCC:1554`, `DCC:1615`. |
| Speed 30' base | **[SAME]** | `V6:2826` — `attributes.speed` exists |
| Luck, spend 1:1, birth augur | **[SAME]** | `V6:636`; d30 chart `V6:666-700` — 30 WF-flavoured entries, mechanically DCC augurs. Gambler **regenerates** Luck `V6:3185` **[NEW]** |
| Saves Fort/Ref/Will ← Sta/Agl/Per | **[SAME]** | `V6:620`, `V6:706-718` |
| **Temporary Personality as a spell-point pool** | **[NEW]** | Most classes pay abilities in temp Per, and **save bonuses recalculate off the current score** `V6:986`, `V6:1004`. Needs a live-derived Will save. |
| **Boons / Hexes tokens** | **[NEW]** | Nat 20 → Boon, nat 1 → Hex `V6:3199`, `V6:3211`. Hexes add +1d per token on fumble charts, −1d on NPC interaction, **+1 Grit DC and +10% Madness per token**. Two counters on the sheet. |
| **Path rank modifier** | **[NEW]** | §3 |

---

## 3. The Path — [NEW], replaces alignment

- Explicitly **"replaces the standard alignment system found in the DCC RPG"** `V6:618`. Three
  states: **Path of the Righteous (PoR) / Walking the Line (WtL) / Path of the Damned (PoD)**
  `V6:880-924`.
- Recorded as a **9-position track, not an enum**:
  `DAMNED +1d, +3, +2, +1, THE LINE, +1, +2, +3, +1d RIGHTEOUS` (`CharacterSheet_FF.md:19`; the
  official PDF has a 9-kid RadioButton named `The Path`).
- The number is a **social-interaction modifier, audience-dependent**: PoR applies against
  townsfolk and lawmen, PoD against criminals, WtL against everyone `V6:944-950`.
- Shifts happen **at most once per session**, by table vote plus judge ruling `V6:936-940`.
  Reaching an end and keeping the `+1d` requires a reaffirming deed each level `V6:942`.
- Path **gates class features**: gunslinger ghost-irons "refuse to fire straight" on PoD
  `V6:1351`; occultist *invoke patron* requires WtL or PoD `V6:3704`; revelator divine healing
  cross-references **healer's Path against target's Path** `V6:2374-2378`, chart `RG:1098`.
- **Monster blocks carry it too**, replacing `AL`: `Path PoD +3`. Conversion table
  Lawful→PoR / Neutral→WtL / Chaotic→PoD at `V6:11291-11295`. **Zero occurrences of `; AL L/N/C`
  in the WF file.**
- Parser warning: token case and spacing are inconsistent across the bestiary — `PoD` / `POD` /
  `POR`, `PoD +3` vs `PoD+3`.

**Module impact:** `details.alignment` (StringField, initial `'l'`) must become a Path value
**plus an integer rank −4…+4**, and the sheet needs the 9-box track widget.

---

## 4. Occupations, augurs, funnel

| Thing | Status | Detail |
|---|---|---|
| d100 occupation table | **[CHANGED]** | 100 weird-west entries, columns `OCCUPATION / WEAPON (DAMAGE) / TRADE GOOD (VALUE)` `V6:730-843`; RG copy `RG:163-290`. Same shape as DCC's, all-new content — but the **trade good carries a `$` value**, where DCC's is a plain good. |
| Four normalized starting firearms | **[NEW]** | Occupational `Pistol*`/`Rifle*`/`Derringer*`/`Shotgun*` resolve to 4 fixed guns plus **1d12 extra rounds** `V6:845-852` |
| Occupation = skill set; trained d20 / untrained **d10** | **[SAME]** | `V6:726`, `V6:2780` |
| Birth augur d30 | **[CHANGED]** | 30 WF-themed entries `V6:666-700`; mechanically DCC's |
| Funnel HP 1d4 + Sta | **[SAME]** | `V6:606` |
| **0-level crit d6 / fumble d14** | **[CHANGED]** | `V6:616`. DCC: crit 1d4 on Table I, fumble by armor (`DCC:502`) |
| 0-level starting money **1d4 dollars** | **[CHANGED]** | `V6:614`. DCC: 5d12 cp |
| 1st+ starting money = class die **× level** | **[CHANGED]** | `V6:614` — note the class blurbs omit the ×level |
| **Signature weapons ignored during the funnel** | **[NEW]** | `V6:878` |
| XP table 0/10/50/110/190/290/410/550/710/890/1090 | **[SAME]** | `V6:890-902` — **byte-identical to DCC** (`DCC:637`). No work needed. |
| Funnel adventure | — | `GF` is a standard DCC-shaped funnel; nothing structurally new |

---

## 5. Combat

### [SAME] — inherited verbatim
Melee = action die + Str (attack *and* damage); ranged = action die + Agl (attack only, **no
ranged damage mod**) `V6:2858-2864`. Round = 10 s, turn = 10 min `V6:2822`. Nat 1 fumble, nat 20
crit, dice-chain crit/fumble thresholds shift with die size `V6:2870-2878`. Two-handed weapons
**−1d initiative** `V6:2838`. Bleeding out at 0 hp for 1st+ `V6:3165`. Ability damage and recovery
`V6:3177-3185`.

### [CHANGED]
- **Crit tables are keyed to damage type, not class:** Blunt / Piercing / Slashing / **Firearms** /
  **Wrestling** `V6:2866`, charts `RG:1723-1849`. **DONE (REQ-SHEET-015)** — all eight charts ship as
  the `wf-crit-tables` pack, 225 rows. *(This entry previously read "the chart CONTENTS are not
  usable from this corpus … V6 omits the charts. Needs the source PDF." **The second half was false**
  and it blocked the requirement for weeks: the 69-of-100 truncation is real but it is the REFERENCE
  GUIDE's printing, and V6's appendix carries all eight charts complete. See the note above.)*
  Weapons carry a `TYPE` column (S/P/B) that selects the chart `RG:1381`. DCC uses Tables I–V by class
  and level (`DCC:1955-2052`).
  **This is the single biggest data-model divergence in combat** — `weapon-data.critTable` exists,
  but the *set of table names* and the class→table mapping must go away.
- **Three fumble tables** by attack mode: Melee / Ranged / **Firearms** `V6:2886`, `RG:1850-1910`.
- **Initiative:** d20 + Agl, but gunslingers substitute **Reflex save bonus for Agility**
  `V6:1391`. Mounted riders use the **mount's** initiative `RG:2069`.
- Situational modifier table `RG:1339-1374` — DCC-shaped with WF rows added. The rows that are
  WF-specific, and what the module does with each (`specs/04-combat.md`):

  | Condition | Modifier | State |
  |---|---|---|
  | Missile fire range: short / medium / long | +1 / 0 / −1 to the attack | **REQ-COMBAT-003** |
  | Firing more than 1 shot in a round | −1 for each shot after the first, cumulative **per action die** | **REQ-COMBAT-002** |
  | Fanning the hammer and not a gunslinger | −1d for each shot after the first, cumulative | **REQ-COMBAT-002** |
  | Behind partial / half / full cover | +1 / +2 / +4 to the **defender's AC** | **REQ-COMBAT-004** |
  | Using a non-signature weapon | −2 attack and −2 initiative | data only — the star marks the weapon (REQ-SHEET-011) |

  The rest — blinded, invisible, higher ground or mounted, squeezing, entangled, firing into melee,
  and the defender's kneeling/prone/helpless states — are **deliberately not automated**. They are
  general situational calls that apply to every attack rather than firearm mechanics, and automating
  them would mean deciding when each applies.

### [NEW]
- **Signature weapons / weapon training.** Two chosen at 1st level, +1 at every odd level;
  **non-signature = −2 attack AND −2 initiative** `V6:978-990`, `RG:1363`. Switching costs one
  session of penalties `V6:992`. Only mystic monks and sin-eaters may pick Exotic weapons
  `V6:988`. Needs a per-weapon boolean plus an auto-applied penalty.
- **The Gun Deck.** A 54-card deck; flip a card **for every shot fired** `V6:3112-3120`. 2–7, 9,
  10 = nothing; face cards = +1/+2/+3 attack and damage; **Aces and Eights = misfire**. Reshuffle
  on exhaustion, on "cleaning my gun", or by spending a Boon `V6:3122`. Interactions: nat 1 after
  a safe draw = miss + Hex, no fumble roll `V6:3128`; crit + Ace/Eight = misfire but no fumble
  roll `V6:3130`. Gunsmithy DC 5, **remove one Ace or Eight per multiple of 5 over the DC**
  `V6:2982`. **No DCC analogue whatsoever — a bespoke per-actor deck-state resource.**
- **Firearm fields:** `CAL | TYPE (single/double/lever) | AMMO | DAMAGE | ROF | LOAD | RELOAD TIME
  | RANGE (s/m/l) | CON | $ | YEAR` `RG:1441-1443`; definitions at `RG:1348-1374`.
  - **ROF** caps shots per round regardless of action dice; cumulative −1 per extra shot on the
    same die `V6:3076`.
  - **Reload time** = rounds to load **one** bullet; `1/3` means 3 per round `V6:3082`. DC 10
    Agility to reload under fire `V6:3082`.
  - **Range bands are flat modifiers**, not DCC's range-category damage: Short **+1**, Medium 0,
    Long **−1** `V6:2902`.
  - **Conceal (CON):** contested **Intelligence** check + CON mod; ties to higher Luck
    `V6:2966-2970`.
  - Shotguns carry a **three-band damage value** `d14/d10/d7` = short/med/long `RG:1580`.
  - LeMat-style guns have dual profiles in parentheses — `d8 (d10/d6/d4)`, `ROF 2 (1)` `RG:1481` —
    needing a secondary-barrel model.
- **Fanning the hammer:** single-action only, −1d cumulative per extra shot, gun-deck flip each
  shot `V6:3134-3136`. Gunslingers get a flat −1 version instead `V6:1387`.
- **Two-weapon table keyed to the Agility *score*** (8− through 18+), with a "cannot crit while
  dual-wielding" column below 18 `V6:3141-3149`.
- **Gun modifications** — 19 mods with cost, effect and restriction `V6:2994-3018`, prose
  `V6:3020-3072`. ⚠️ *Table and prose disagree* on filed sights, slicked trigger, shortened-barrel
  cost, folding spur and trigger guard — **resolve before shipping.**
- **Weapon traits as keywords:** Defensive, Disarm, Paired, Slow, Thrown, Trip `RG:1331-1346`.
- **Showdowns:** opposed Personality staredown, then a draw with bonuses from conceal rating,
  mods and holster `RG:2107-2113`.
- **Dynamite:** 4d6 / 50' radius, DC 12 Ref half, +1d and +20' per extra stick `RG:2015-2019`,
  identical wording at `V6:3379`. *(An earlier version of this file flagged `V6:14509`'s "6d6" as
  a conflicting value. It is not: that line is inside an NPC stat block and footnote-marked as a
  variant for that NPC's bundle. The base item is 4d6.)*
- Subdual: unarmed 1d3+Str `RG:2123`; a sap does non-lethal **Stamina** damage `RG:1406`.

---

## 6. Magic and the weird subsystems

**Architecture [CHANGED]:** one **Arcane Checks table** routes 10 classes to 5 distinct resolution
systems `V6:3612-3630`:

| System | Formula |
|---|---|
| Spell check (occultist) | d20 + Int + level + declared spellburn |
| Miracle check (revelator) | d20 + **Personality** + level |
| Gear check (bedlamite) | d20 + Int + level |
| Brew check (mountebank) | d20 + Int + level |
| Personality-cost abilities (calavera, hellbilly, luchador, mystic monk, sin-eater, tommyknocker, dog soldier) | usually **no roll** — just a temp-Personality spend |

**[SAME]** — the spell-check-vs-results-chart engine itself, spellburn `V6:2253`, corruption on
nat 1 (Minor/Major/Greater d10 tables, minus spell level, plus Luck) `V6:3674-3694`, mercurial
magic d% rolled once per spell learned `V6:3714-3718`, patrons via *invoke patron* `V6:3704`,
lost-spell recovery in 24 h `V6:3650`. Spell entries use the DCC field set
`Level/Range/Duration/Casting Time/Save/General` **plus Manifestation and Corruption tables**
`V6:3873-3891`. **DCC wizard and cleric spells are explicitly declared drop-in compatible** —
clerical spells are just renamed "miracles" `V6:3863`.

**[CHANGED]** — `Save:` can be **Grit** as well as Fort/Ref/Will `V6:3881`. Patrons are Elder
Gods; the pact grants +1 spell per level and +1d on invoke-patron rolls at the cost of automatic
corruption `V6:3708-3712`.

### [NEW] Bedlamite contraptions
- **Mundane** — 2 at 1st level, +1 per level automatically, no roll `V6:1044`. Built via the
  **Repair/Construction table** (`V6:1060-1078`): complexity **Basic / Advanced / Complex /
  Alien**, each with minor and major repair time, repair cost, **repair DC (5/11/14/17/20/23/25/30)**,
  construction time and `$` per hour or day. Alien tech is repair-only. A failed build rolls extra
  time dice per point missed `V6:1050`.
- **Wondrous** — 3 at 1st level, +1 per level `V6:1056`. Each use is a **Gear check** against a
  per-item result chart `V6:1058`; nat 1 = **Mechanical Calamity**, item unusable until repaired
  `V6:1058`. 50 items across 5 power levels `V6:3963-5298`. Inheriting one costs a week per
  contraption level **plus 1 permanent Luck** `V6:3644`.
- Contraptions count as **signature weapons** when used as weapons `V6:1026`.

### [NEW] Derangements
Bedlamite rolls d% every level against a rising **Derangement %** (40%→85%) `V6:1018`,
`V6:1086-1094`. Derangements also arrive via Madness.

### [NEW] Fear & Madness
- Grit check = **d20 + Will save mod vs DC 8 + creature HD + Hex tokens** `V6:3229`. **The Fear DC
  is derived from HD and never stored on the monster.**
- Success immunizes against that source for the adventure; nat 20 restores +1 Grit and grants +1d
  against the source; failure costs Grit equal to the creature's HD and consults the **Fear chart**
  (**30 rows**: `1 or less`, 2-29, `30+` — this file previously said 31) with the margin modified
  by Luck and Hexes `V6:3231-3243`, chart `V6:3255-3299`; nat 1 doubles the loss `V6:3243`.
- **CANON CONFLICT — how the Fear chart is indexed.** V6 says the index *is* the failure margin and
  never mentions a die, and says so **three times**: the Failure rule (`V6:3235`), the Critical
  failure rule (same paragraph block), and the Fear Chart intro (`V6:3257`) — "Use the number the
  Grit check failed by modified by Luck … and any Hex tokens". The Reference Guide instead says
  **"Roll 1d20 modified by"** the margin plus Luck and Hexes (`RG:1922`), and heads its column
  `ROLL 1D20`. `data/fear_madness.json` records `index: grit-check-failure-margin` (the V6 reading,
  as the core rulebook stating it three times) with the RG variant recorded alongside under
  `fear.conflict`. **Settle before any automation rolls it** — the readings differ in how often the
  lethal high rows are reachable at all.
- **The chart rows are only complete in the PDF.** pdf2md drops the MIDDLE of these long cells and
  splices head to tail, so a corrupted row is still a grammatical sentence — corpus row 8 reads
  "Since there's no bed to source of your fear", missing a clause, and passes any
  ends-in-a-full-stop test. `tools/build_fear_table.py` reads the PDF text layer
  (the rulebook PDF, pages 146-147) and cross-checks the 9
  rows the Reference Guide prints.
- 0 Grit → **Madness**: d% ±10% per Luck mod, +10% per Hex → Minor Phobia / Minor Disorder / Major
  Phobia / Major Disorder `V6:3301-3323`. Phobias impose DC 12 or DC 15 Will, or −1d/−2d.
  **Deliberately no random derangement list** — judge and player choose `V6:3325-3331`.
- Grit resets between adventures, but an adventure that hit zero costs **1 permanent Grit**
  `V6:3245`.

### [NEW] Fall From Grace (revelator)
Nat 1 on a miracle, turn-back-the-night or divine healing starts a fall; each *failure* raises the
threshold `V6:2358-2362`, `V6:3800-3802`. Atonement chart `RG:1163-1180`.

### [NEW] Other class subsystems
**Dead Man's Hand** (gambler) `V6:1275-1310` · **Trick Shots** (gunslinger) `V6:1419-1550` ·
**Magic Jug** (hellbilly) `V6:1599-1620` + **intoxication levels** `V6:1621` · **Spirit Mask /
Signature Moves** (luchador) `V6:1731-1958` · **martial-arts maneuvers** (monk) `V6:2113-2224` ·
**familiars** (occultist) `V6:2291-2368` · **River Rites / Shadow Walk** (sin-eater)
`V6:2574-2630` · **Dark Inheritance** (tommyknocker) `V6:2674-2744`.

---

## 7. Equipment & economy

- **Currency is the US dollar, decimal, to the cent** `RG:2226-2503`. **No cp/sp/gp/ep/pp.** DCC's
  `CurrencyField` (`fields/currency-field.mjs`, five integer coin fields) must be replaced with a
  single 2-decimal `dollars` field. Coins appear only as flavour — "25 silver dollars", `V6:792`.
- Melee table `WEAPON | DAMAGE | TYPE | LBS | $ | NOTES` — `RG:1378-1421`, 42 rows. `TYPE` (S/P/B)
  is the crit-chart selector and **has no DCC equivalent**. The Exotic flag lives in NOTES.
- Ranged non-firearm `RG:1423-1437` (11 rows); firearms simplified `RG:1439-1456` (11) and
  advanced `RG:1506-1587` (~90 across revolvers, derringers, rifles, shotguns); machine guns
  `V6:16165-16174`; artillery, artillery ammo and an **artillery crit table** `RG:1620-1684`.
- **Ammo: flat `$1 per box of 50`, any caliber** `V6:17218`. Types: `C&B`, `Cart.`, `ML/C&B`,
  `ML/Flintlock`, `Pinfire Cart.`, `Volcanic "Rocketball"`, `Paper Cart.`
- **No armor table** (§2).
- General store ~100 items, all `ITEM | COST` two-column `RG:2446-2481`; plus clothing (M/F),
  accessories, smokes, entertainment, sundries, home/farm, livery accessories, services, saloon,
  pharmacy — ranges at `RG:2214-2499`.
- **The Livery**: a statted mount table (Camel / Horse / Draft / Mule / Oxen / Pony) with
  `MOVEMENT walk/trot/gallop | HIT DIE | INIT | AC | ATTACK/DMG | REF/FORT/WILL | SKILL BONUS |
  COST`, plus **Quality Modifiers** (Crow Bait / Aging / Average / Quality / Charger) applying a
  full stat delta and a price multiplier `RG:2214-2224`. Maps onto DCC's `mount-data.mjs`, whose
  schema is currently empty.
- ⚠️ **Data conflicts:** doctor's bag `$20` vs `$25` (`RG:2472` vs `RG:2492-2499`) — still open.
  *The horse and dynamite entries formerly listed here were not conflicts.* `Horse (average)` is
  $60 and `Horse (riding-good)` is $150 (`RG:2340`, `:2343`) — two different animals, both in the
  Animals table. Dynamite is 4d6 (`V6:3379`); the 6d6 is a footnote on one NPC's bundle.

---

## 8. Character sheet fields

**Use the PDF form fields, not the markdown conversions.** pdf2md redacted most of the sheet —
`CharacterSheet_FF.md` and `FF_Funnel_sheet.md` are near-useless.

> ⚠️ **CORRECTED 2026-09-12.** This section originally derived the field list from
> `~/WF-Stuff/Obadiah Dunmore.pdf` and concluded "the official sheet is per-class". **That is
> wrong.** The Obadiah file is a *custom* fillable with semantic field names and bedlamite-only
> boxes. The published sheet — `CharacterSheet01A_REV05`, now at
> `~/WF-Stuff/CharacterSheet_FF_official_REV05.pdf` — is **one sheet used by every class**, with
> no class-specific boxes at all. Field-by-field map in `docs/official-sheet-field-map.md`; that
> file is the authority for sheet work, and the table below describes the fan sheet.
>
> A textbook case of the shared briefing's §4c shape: the analysis was sound and ran correctly,
> against the wrong artifact.

### (a) Already in the `dcc` data model
`name` · `occupation` (`details.occupation`) · `sign` + `signmod` (`details.birthAugur` +
`birthAugurLuckMod`) · `str/agl/sta/per/int/luck` + mods (`abilities.*`) · `ref/fort/will`
(`saves.*`) · `init` · `speed` · `hp`/`maxhp` · `AC` · `melee`/`ranged`
(`details.attackHitBonus.*`) · `level` · `title` · `xp` · `crit die`/`fumble die`
(`attributes.critical.die`, `attributes.fumble.die`) · `1st/2nd action die`
(`attributes.actionDice.options`) · `languages` · notes.

### (b) WF-only — needs new data + UI

| Field | Note |
|---|---|
| `grit` | current + max pool, with permanent-erosion tracking |
| `Boons`, `Hexes` | two counters; both feed other formulas |
| `The Path` (9-position radio) | replaces `details.alignment` — value + rank |
| `wealth` | dollars; replaces the five-coin currency block |
| `conceal1..3`, `ROF1..3`, `load1..3`, `rt1..3`, `ammo1..3` | firearm-only columns on 3 firearm rows; `weapon-data.mjs` has none of these |
| `firearmnotes1..3` | free text |
| `derangements` | class-specific |
| `mundane contraptions` | class-specific counter |
| Gun-deck state | **not on the paper sheet** — it is a physical deck; the module must add it |
| Signature-weapon flag | not a sheet field; implied by the back sheet's `signature weapons` box |
| Back sheet | `character background`, `personality`, `short term`, `long term`, `secrets`, `line in the sand`, `preacher`, `party connections`, `places`, `allies`, `enemies`, `plot crumbs`, `character equipment`, `signature weapons`, `languages`, portrait |
| Contraption sheet | one page per wondrous contraption: `contraption name / description / manifestation / malfunctions / gear checks / range / duration / charge time / save` |

> **Landmine:** the 9 Path radio kids are **not in left-to-right order** — by x they run
> `/4 /3 /2 /1 /0 /5 /6 /7 /8`, so `/0` is the **centre** (THE LINE), not the leftmost position.
> Order by `/Rect` x before mapping a value to a printed label.

---

## 9. Bestiary / NPC stat block

Chapter Seven: `V6:11266-13545`; first block `V6:11429`, last `V6:13537`.

**Field order:** `**Name:**` → `Init` → `Atk` → `AC` → `HD` → [`hp`] → `MV` → `Act` → [`SP`] →
`SV Fort/Ref/Will` → `Path`.

**Versus DCC** (`DCC:8107+`): every field is **[SAME]** except `AL L/N/C` →
`Path PoR|WtL|PoD (+N)` **[CHANGED/RENAMED]**. There are **zero `; AL [LNC]` occurrences in the WF
file.** No Grit field, no Fear DC, no Sanity number, no ROF field on monsters.

```
**Abaia:** Init +3; Atk bite melee +3 (1d12); AC 12; HD 5d8; MV 60' swimming; Act 1d20;
SP crashing wave, monsoon; SV Fort +1, Ref +3, Will -1; Path POR +1.                 V6:11429

**Gug:** Init +1; Atk claw +18 melee (2d6+8) or bite +20 melee (4d8+8); AC 18; HD 12d10;
MV 50'; Act 1d24; SP crit on 20-24, roll 1d24 on Crit table, irrational fear of ghouls;
SV Fort +12, Ref +5, Will +8; PoD +1.                                                V6:12454
```

- **Crit die and table are derived, not stored**: HD→die table `V6:11399-11421`, table letter by
  attack type `V6:11392`. Crit prose lives inside `SP`.
- **Fear DC = 8 + HD + the *character's* Hex tokens** `V6:3229` — compute at render time.
- **Blessings from the Elder Gods** — a d% bolt-on mutation table `V6:11333-11389` **[NEW]**.
- **"Mythos" creature type** counts as outsiders and defaults to PoD `V6:11297-11303` **[NEW]**.
- Human NPC blocks extend the schema with a trailing
  `Pistol: <name> - shots N, damage Xd, range a/b/c, reload N` clause plus inventory and cash:
  `V6:13623` (Jed Rawlings), `V6:13603`, `V6:9938` (Deadeye Dan, a 6th-level tommyknocker NPC).
- **No generic human-adversary section** — no stock outlaw / lawman / gunslinger blocks; `# NPCS`
  at `V6:9776` is pure prose.
- An importer must tolerate: `Int`/`Ini` typos for Init (`V6:11439`, `V6:12757`); `HD <1`,
  `HD 4d100`, `HD 2 hit points`; `Act special`; **slash-delimited multi-form values** for
  shapeshifters (`AC 9/12/15`, `V6:13100`); and inconsistent Path token case and spacing.

---

## 10. Unchanged — no module work needed

WF is a true DCC variant. These are verbatim inherits:

- **Six ability scores and their names**, 3d6-in-order, the −3…+3 modifier table, bonus languages
  `V6:602-662`.
- **The dice chain** and `±Nd` step notation `V6:534`.
- **Core mechanic**: d20 vs DC/AC, nat 1 auto-fail/fumble, nat 20 auto-crit `V6:524-528`.
- **XP table, identical values** `V6:890-902` = `DCC:637`.
- **Three saving throws**, same names, same governing abilities `V6:620`, `V6:706-718`.
- **Skills**: occupation-trained d20 / untrained d10, assists +1 up to 4 allies `V6:2780`,
  `V6:2792`.
- **DC ladder** 5/10/15/20 `V6:2760-2774`.
- **Melee = Str attack + damage; ranged = Agl attack only** `V6:2858-2864`.
- **Action-dice progression shape**, multi-die attacks, crit/fumble thresholds shifting with die
  size `V6:2866-2878`.
- **Spellburn, corruption, mercurial magic, patrons, spell-check-vs-results-chart** `V6:2253`,
  `V6:3674-3718`, `V6:3704`.
- **DCC wizard and cleric spells are declared drop-in** — clerics' spells are relabelled
  "miracles" `V6:3863`. The module can reuse the DCC spell compendium unaltered.
- **Monster stat-block grammar** (everything but `AL`) `V6:11429` vs `DCC:8647`.
- Bleeding out, healing rates, ability-point loss and recovery, encumbrance-as-judgement
  `V6:3165-3185`, `RG:2021`.
- Luck burn 1:1 and the birth-augur mechanic — content differs, mechanic does not `V6:636`.

---

## Effort ranking

1. **The Gun Deck** — no analogue at all; a bespoke per-actor persistent resource.
2. **Crit/fumble tables keyed to damage type** rather than class — the deepest data-model change.
3. **The Grit / Fear / Madness loop** with its Hex-token coupling.
4. **The Path track** replacing alignment.
5. **The firearm field set** — ROF / Load / Reload / Conceal / three-band range.
6. **Currency replacement** — dollars for the five-coin block.
7. **Dropping the armor item type.**
