/**
 * The ONLY place that knows about the World & Campaign Builder. Nothing is imported from or
 * patched in the Campaign Builder.
 *
 * Why the entries are read from its compendia and not from `module.api.getEntries`:
 * that API only knows the Campaign Builder's *current setting*, which it sets when its window
 * is first opened. Until then it returns nothing. The compendia are always there.
 *
 * Re-check against the Campaign Builder's `src/classes/Documents/FCBSetting.ts` (`createCompendium`),
 * `src/documents/indices.ts` and `src/documents/entry.ts` with every Campaign Builder release.
 * @module integration/campaign-builder-bridge
 */
import { UPSTREAM } from "../constants.mjs";

/** Index fields needed to recognize an entry and its topic (same ones the Campaign Builder indexes). */
const INDEX_FIELDS = [
  `flags.${UPSTREAM.CAMPAIGN_BUILDER_ID}.${UPSTREAM.TYPE_FLAG}`,
  "pages.name",
  "pages.system.topic"
];

/**
 * @typedef {object} EntryRef
 * @property {string} uuid     UUID of the Campaign Builder entry (the wrapping JournalEntry).
 * @property {string} name
 * @property {string} setting  Name of the Campaign Builder setting (its compendium) the entry belongs to.
 */

export class CampaignBuilderBridge {
  /** @returns {boolean} Whether the Campaign Builder is installed and active. */
  static get isActive() {
    return game.modules.get(UPSTREAM.CAMPAIGN_BUILDER_ID)?.active === true;
  }

  /** @returns {number} Topic value of non-player characters (NPCs). */
  static get npcTopic() {
    return game.modules.get(UPSTREAM.CAMPAIGN_BUILDER_ID)?.api?.TOPICS?.Character ?? UPSTREAM.TOPIC_FALLBACK.CHARACTER;
  }

  /** @returns {number} Topic value of player characters. */
  static get pcTopic() {
    return game.modules.get(UPSTREAM.CAMPAIGN_BUILDER_ID)?.api?.TOPICS?.PC ?? UPSTREAM.TOPIC_FALLBACK.PC;
  }

  /**
   * NPC entries of all Campaign Builder settings.
   * @returns {Promise<EntryRef[]>}
   */
  static npcs() {
    return CampaignBuilderBridge.#entries(CampaignBuilderBridge.npcTopic);
  }

  /**
   * Player character entries of all Campaign Builder settings.
   * @returns {Promise<EntryRef[]>}
   */
  static pcs() {
    return CampaignBuilderBridge.#entries(CampaignBuilderBridge.pcTopic);
  }

  /**
   * Resolve a UUID to its Campaign Builder entry (a JournalEntry holding one entry page).
   * @param {string|null} uuid
   * @returns {Promise<JournalEntry|null>}  Null when the uuid is empty or the entry no longer exists.
   */
  static async resolve(uuid) {
    if (!uuid) return null;
    try {
      return (await fromUuid(uuid)) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Player name stored on a PC entry, if any.
   * @param {JournalEntry|null} entry
   * @returns {string}
   */
  static playerName(entry) {
    return entry?.pages?.contents?.[0]?.system?.playerName ?? "";
  }

  /**
   * Scan the Campaign Builder's compendia for entries of one topic.
   * @param {number} topic
   * @returns {Promise<EntryRef[]>}
   */
  static async #entries(topic) {
    const result = [];
    for (const pack of game.packs) {
      if (!CampaignBuilderBridge.#isCampaignBuilderPack(pack)) continue;
      const setting = pack.metadata.label.slice(UPSTREAM.PACK_LABEL_PREFIX.length);
      try {
        const index = await pack.getIndex({ fields: INDEX_FIELDS });
        for (const e of index) {
          const type = e.flags?.[UPSTREAM.CAMPAIGN_BUILDER_ID]?.[UPSTREAM.TYPE_FLAG];
          if (type === UPSTREAM.ENTRY_TYPE && e.pages?.[0]?.system?.topic === topic) {
            result.push({ uuid: e.uuid, name: e.name, setting });
          }
        }
      } catch (err) {
        console.warn(`${UPSTREAM.CAMPAIGN_BUILDER_ID} compendium "${pack.metadata.label}" could not be read.`, err);
      }
    }
    return result;
  }

  /**
   * @param {CompendiumCollection} pack
   * @returns {boolean}  Whether the pack is one the Campaign Builder created for a setting.
   */
  static #isCampaignBuilderPack(pack) {
    return (
      pack.documentName === "JournalEntry" &&
      pack.metadata.packageType === "world" &&
      pack.metadata.label?.startsWith(UPSTREAM.PACK_LABEL_PREFIX)
    );
  }
}
