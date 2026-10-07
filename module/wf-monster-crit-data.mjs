/**
 * Monster critical-hit and fumble dice by Hit Dice — GENERATED, do not hand-edit.
 *
 * Regenerate with tools/build_monster_crits.py; `npm run verify` re-derives this from the book
 * and fails if it drifts.
 *
 * Source: Weird_Frontiers_V6.md:11398 — "Use a creature's HD to determine the appropriate
 * die rolled for both critical hits and fumbles by referencing the chart below."
 *
 * The book prints these as "D4/D14"; they are written here as Foundry dice formulas ('1d4',
 * '1d14'), which is the same die in the notation the rest of this module and the system use.
 *
 * Note the fumble die runs the OPPOSITE way to the crit die: a tougher creature crits harder
 * (d4 -> d30) and fumbles less badly (d14 -> d3). A single "bigger is better" assumption would
 * get one of the two backwards.
 */

/** Indexed by the chart's HD rows: index 0 is "Less than 1", index 21 is "21+". */
export const MONSTER_CRIT_TABLE = [
  { hd: 0, crit: '1d4', fumble: '1d14' }, // "Less than 1"
  { hd: 1, crit: '1d6', fumble: '1d12' },
  { hd: 2, crit: '1d8', fumble: '1d12' },
  { hd: 3, crit: '1d8', fumble: '1d12' },
  { hd: 4, crit: '1d10', fumble: '1d10' },
  { hd: 5, crit: '1d10', fumble: '1d10' },
  { hd: 6, crit: '1d12', fumble: '1d10' },
  { hd: 7, crit: '1d12', fumble: '1d8' },
  { hd: 8, crit: '1d14', fumble: '1d8' },
  { hd: 9, crit: '1d14', fumble: '1d8' },
  { hd: 10, crit: '1d16', fumble: '1d7' },
  { hd: 11, crit: '1d16', fumble: '1d7' },
  { hd: 12, crit: '1d20', fumble: '1d7' },
  { hd: 13, crit: '1d20', fumble: '1d6' },
  { hd: 14, crit: '1d20', fumble: '1d6' },
  { hd: 15, crit: '1d20', fumble: '1d6' },
  { hd: 16, crit: '1d24', fumble: '1d4' },
  { hd: 17, crit: '1d24', fumble: '1d4' },
  { hd: 18, crit: '1d24', fumble: '1d4' },
  { hd: 19, crit: '1d24', fumble: '1d3' },
  { hd: 20, crit: '1d30', fumble: '1d3' },
  { hd: 21, crit: '1d30', fumble: '1d3' } // "21+"
]

/**
 * The crit and fumble dice for a creature with `hd` Hit Dice.
 *
 * @param {number} hd - hit dice as a number; fractional or 0 selects the "Less than 1" row.
 * @returns {{crit: string, fumble: string}} dice formulas
 */
export function monsterCritDice (hd) {
  const n = Number(hd)
  if (!Number.isFinite(n) || n < 1) return MONSTER_CRIT_TABLE[0]
  return MONSTER_CRIT_TABLE[Math.min(Math.floor(n), 21)]
}

/**
 * Hit Dice as a NUMBER, from the string DCC stores in `system.attributes.hitDice.value`.
 *
 * That field is free text and holds things like '5d8', '1d4+2', '½', '2' — the count before the
 * 'd' is the HD, which is what the chart is keyed on. Returns null when nothing parses, so a
 * caller can show nothing rather than silently treating an unreadable value as 0 HD.
 *
 * @param {string} value
 * @returns {number|null}
 */
export function parseHitDice (value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (/^(½|1\/2)/.test(s)) return 0.5
  const m = s.match(/^(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}
