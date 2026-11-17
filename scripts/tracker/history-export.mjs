/**
 * Transfers the history of an NPC's trackers into a Campaign Builder editor field of the NPC
 * entry. The field (chosen in the module settings) belongs to this module: every export
 * rebuilds it from all trackers of the NPC and overwrites what was there.
 * @module tracker/history-export
 */
import { I18N_PREFIX } from "../constants.mjs";
import { CampaignBuilderBridge } from "../integration/campaign-builder-bridge.mjs";
import { ModuleSettings } from "../settings.mjs";
import { HistoryHtml } from "./history-html.mjs";
import { LogTimeFormat } from "./log-time-format.mjs";
import { TrackerStore } from "./tracker-store.mjs";

/**
 * @typedef {object} ExportResult
 * @property {string} npc       Name of the NPC entry.
 * @property {string} field     Label of the Campaign Builder field written to.
 * @property {number} trackers  Number of trackers exported.
 */

export class HistoryExport {
  /**
   * Write the history of all trackers of one NPC into the configured field (GM only). An
   * organization entry uses the organization field setting, a character the character one.
   * @param {string} npcUuid  UUID of the NPC's (character or organization) Campaign Builder entry.
   * @returns {Promise<ExportResult>}
   * @throws {Error} With a localized message when no field is configured, the field no longer
   *   exists (or is no editor field), the NPC is a manual name or its entry no longer exists.
   */
  static async exportNpc(npcUuid) {
    const error = (key, data = {}) => new Error(game.i18n.format(`${I18N_PREFIX}.Export.${key}`, data));
    if (!game.user.isGM) throw new Error(game.i18n.localize(`${I18N_PREFIX}.Errors.gmOnly`));

    if (!npcUuid) throw error("manualNpc");
    const entry = await CampaignBuilderBridge.resolve(npcUuid);
    if (!entry) throw error("npcMissing");

    // Characters and organizations have separate field definitions, hence separate settings.
    const organization = CampaignBuilderBridge.isOrganization(entry);
    const setting = game.i18n.localize(
      `${I18N_PREFIX}.Settings.${organization ? "exportFieldOrganization" : "exportField"}.name`
    );
    const fieldName = organization ? ModuleSettings.exportFieldOrganization : ModuleSettings.exportField;
    if (!fieldName) throw error("noField", { setting });
    const fields = organization
      ? CampaignBuilderBridge.organizationEditorFields()
      : CampaignBuilderBridge.characterEditorFields();
    const field = fields.find(f => f.name === fieldName);
    if (!field) throw error("fieldMissing", { field: fieldName, setting });

    const trackers = TrackerStore.list({ npcUuid });
    const sections = await Promise.all(trackers.map(t => HistoryExport.#section(t)));
    const realFormat = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "medium", timeStyle: "short" });
    const html = HistoryHtml.build(sections, {
      noChanges: game.i18n.localize(`${I18N_PREFIX}.Card.noChanges`),
      footer: game.i18n.format(`${I18N_PREFIX}.Export.footer`, { date: realFormat.format(Date.now()) })
    });

    await CampaignBuilderBridge.setCustomField(entry, field.name, html);
    return { npc: entry.name, field: game.i18n.localize(field.label), trackers: trackers.length };
  }

  /**
   * Localized export data of one tracker. Log entries come in the order of the EXPORT_ORDER setting.
   * @param {import("./tracker-math.mjs").Tracker} tracker
   * @returns {Promise<import("./history-html.mjs").HistorySection>}
   */
  static async #section(tracker) {
    const t = text => game.i18n.localize(text);
    const pc = tracker.pcUuid
      ? ((await CampaignBuilderBridge.resolve(tracker.pcUuid))?.name ?? t(`${I18N_PREFIX}.Panel.missingPc`))
      : tracker.pcName;
    const subtitle = tracker.name ? t(tracker.name) : "";
    const title = [pc, subtitle].filter(Boolean).join(" – ") || t(`${I18N_PREFIX}.Export.noPc`);

    const mode = ModuleSettings.logTime;
    const dateFormat = new Intl.DateTimeFormat(game.i18n.lang, { dateStyle: "short", timeStyle: "short" });
    return {
      title,
      bars: tracker.bars.map(bar => ({ label: t(bar.label), value: bar.value, steps: bar.steps })),
      entries: HistoryHtml.order(tracker.log, ModuleSettings.exportOrder).map(entry => ({
        time: LogTimeFormat.entry(entry, mode, dateFormat).time,
        label: t(entry.label),
        from: entry.from,
        to: entry.to,
        note: entry.note
      }))
    };
  }
}
