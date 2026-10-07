/* global foundry */
/**
 * Weird Frontiers item sheet — adds a Firearm tab to weapon items.
 *
 * Subclasses DCC's item sheet rather than forking it: `_configureRenderParts` and
 * `_getTabsConfig` are both overridable, so one extra part and one extra tab is the whole
 * change, and the other ~900 lines stay upstream's.
 *
 * The tab appears on weapon items only, and is the place the "is this a firearm?" switch lives —
 * so a plain melee weapon in a WF world is untouched.
 */
/* eslint-disable-next-line import/no-absolute-path */
import DCCItemSheet from '/systems/dcc/module/item-sheet.js'
import { DAMAGE_TYPES, MODULE_ID, isSingleAction, looksLikeBandedDamage, normaliseFirearm, rofCeiling } from './wf-firearm.mjs'

class WFItemSheet extends DCCItemSheet {
  /**
   * Wider than DCC's 555. Adding a fifth tab pushes the last one into the responsive-tabs
   * overflow menu at the default width, which hides the Firearm tab behind a "..." button —
   * verified on the smoke server before this was widened.
   */
  static DEFAULT_OPTIONS = {
    position: { width: 650 }
  }

  /** @inheritDoc */
  _configureRenderParts (options) {
    const parts = super._configureRenderParts(options)
    if (this.document.type === 'weapon') {
      parts.wfFirearm = {
        id: 'wfFirearm',
        template: `modules/${MODULE_ID}/templates/item-sheet-wf-firearm.html`
      }
    }
    return parts
  }

  /** @inheritDoc */
  _getTabsConfig (group) {
    const tabs = foundry.utils.deepClone(super._getTabsConfig(group))
    if (this.document.type === 'weapon' && tabs?.tabs) {
      tabs.tabs.push({ id: 'wfFirearm', group, label: 'WF.Firearm.Tab' })
    }
    return tabs
  }

  /** @inheritDoc */
  async _prepareContext (options) {
    const context = await super._prepareContext(options)
    const firearm = normaliseFirearm(this.document)
    context.wf = {
      firearm,
      // Only a single-action gun can be fanned, so surface that rather than making the reader
      // parse a free-text action string.
      canBeFanned: isSingleAction(firearm.actionType),
      rofCeiling: rofCeiling(firearm.rof),
      damageTypes: DAMAGE_TYPES,
      // Surfaces the division trap rather than letting a shotgun silently roll ~1 damage.
      damageLooksBanded: looksLikeBandedDamage(this.document.system?.damage)
    }
    return context
  }
}

export { WFItemSheet }
