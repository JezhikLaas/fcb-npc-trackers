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
 * The custom field definitions come from the Campaign Builder's world setting `customFields`
 * (`{[CustomFieldContentType]: {name, label, fieldType, sortOrder, deleted}[]}`); their values
 * live in the entry page's `system.customFields[name]`.
 * @module integration/campaign-builder-bridge
 */
import { UPSTREAM } from "../constants.mjs";
import { HistoryHtml } from "../tracker/history-html.mjs";

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
 * @property {boolean} organization  Whether the entry is an organization (not a character).
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

  /** @returns {number} Topic value of organizations. */
  static get organizationTopic() {
    return (
      game.modules.get(UPSTREAM.CAMPAIGN_BUILDER_ID)?.api?.TOPICS?.Organization ?? UPSTREAM.TOPIC_FALLBACK.ORGANIZATION
    );
  }

  /** @returns {number} Topic value of player characters. */
  static get pcTopic() {
    return game.modules.get(UPSTREAM.CAMPAIGN_BUILDER_ID)?.api?.TOPICS?.PC ?? UPSTREAM.TOPIC_FALLBACK.PC;
  }

  /**
   * Entries that can take the NPC side of a tracker: characters and organizations of all
   * Campaign Builder settings (`organization` tells them apart).
   * @returns {Promise<EntryRef[]>}
   */
  static npcs() {
    return CampaignBuilderBridge.#entries([CampaignBuilderBridge.npcTopic, CampaignBuilderBridge.organizationTopic]);
  }

  /**
   * Player character entries of all Campaign Builder settings.
   * @returns {Promise<EntryRef[]>}
   */
  static pcs() {
    return CampaignBuilderBridge.#entries([CampaignBuilderBridge.pcTopic]);
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
   * Whether a resolved entry is an organization (its entry page has the organization topic).
   * @param {JournalEntry|null} entry
   * @returns {boolean}
   */
  static isOrganization(entry) {
    return entry?.pages?.contents?.[0]?.system?.topic === CampaignBuilderBridge.organizationTopic;
  }

  /**
   * Editor fields (the only ones that keep formatting) currently defined for characters (NPCs),
   * without deleted ones. Empty when the Campaign Builder or its setting is not available.
   * @returns {import("../tracker/history-html.mjs").FieldChoice[]}
   */
  static characterEditorFields() {
    return CampaignBuilderBridge.#editorFields(UPSTREAM.CONTENT_TYPE_CHARACTER);
  }

  /**
   * Editor fields currently defined for organizations, without deleted ones.
   * @returns {import("../tracker/history-html.mjs").FieldChoice[]}
   */
  static organizationEditorFields() {
    return CampaignBuilderBridge.#editorFields(UPSTREAM.CONTENT_TYPE_ORGANIZATION);
  }

  /**
   * @param {number} contentType  A `CustomFieldContentType` value.
   * @returns {import("../tracker/history-html.mjs").FieldChoice[]}
   */
  static #editorFields(contentType) {
    let definitions;
    try {
      definitions = game.settings.get(UPSTREAM.CAMPAIGN_BUILDER_ID, UPSTREAM.CUSTOM_FIELDS_SETTING);
    } catch {
      return [];
    }
    return HistoryHtml.editorFields(definitions?.[contentType], UPSTREAM.FIELD_TYPE_EDITOR);
  }

  /**
   * Replace the content of a custom field on an entry. Only the field's value is written: the
   * Campaign Builder's own search index picks it up the next time it rebuilds or saves the entry.
   * @param {JournalEntry} entry  A resolved Campaign Builder entry.
   * @param {string} fieldName    Key in `system.customFields`.
   * @param {string} html
   * @returns {Promise<void>}
   * @throws {Error} When the entry has no entry page or the update fails (e.g. a locked compendium).
   */
  static async setCustomField(entry, fieldName, html) {
    const page = entry?.pages?.contents?.[0];
    if (page?.type !== UPSTREAM.ENTRY_TYPE) throw new Error(`"${entry?.name}" is not a Campaign Builder entry.`);
    await page.update({ [`system.customFields.${fieldName}`]: html });
  }

  /**
   * Scan the Campaign Builder's compendia for entries of the given topics.
   * @param {number[]} topics
   * @returns {Promise<EntryRef[]>}
   */
  static async #entries(topics) {
    const organizationTopic = CampaignBuilderBridge.organizationTopic;
    const result = [];
    for (const pack of game.packs) {
      if (!CampaignBuilderBridge.#isCampaignBuilderPack(pack)) continue;
      const setting = pack.metadata.label.slice(UPSTREAM.PACK_LABEL_PREFIX.length);
      try {
        const index = await pack.getIndex({ fields: INDEX_FIELDS });
        for (const e of index) {
          const type = e.flags?.[UPSTREAM.CAMPAIGN_BUILDER_ID]?.[UPSTREAM.TYPE_FLAG];
          const topic = e.pages?.[0]?.system?.topic;
          if (type === UPSTREAM.ENTRY_TYPE && topics.includes(topic)) {
            result.push({ uuid: e.uuid, name: e.name, setting, organization: topic === organizationTopic });
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
