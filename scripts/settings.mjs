/**
 * Registration of and typed access to this module's settings.
 * @module settings
 */
import { DEFAULT_TEMPLATE_ID, HOOKS, I18N_PREFIX, LOG_TIME_MODES, MODULE_ID, SETTINGS, UPSTREAM } from "./constants.mjs";
import { CampaignBuilderBridge } from "./integration/campaign-builder-bridge.mjs";
import { TemplateCollection, TrackerCollection } from "./tracker/tracker-data.mjs";

export class ModuleSettings {
  /**
   * Choices of the EXPORT_FIELD dropdown. The settings dialog reads this object on every render,
   * so it is refilled in place whenever the Campaign Builder's field definitions change.
   * @type {Record<string, string>}
   */
  static #exportFieldChoices = {};

  /**
   * Register all settings. Call during the `init` hook.
   */
  static register() {
    game.settings.register(MODULE_ID, SETTINGS.TRACKERS, {
      scope: "world",
      config: false,
      type: TrackerCollection,
      default: { trackers: [] },
      onChange: () => Hooks.callAll(HOOKS.TRACKERS_UPDATED)
    });

    game.settings.register(MODULE_ID, SETTINGS.TEMPLATES, {
      scope: "world",
      config: false,
      type: TemplateCollection,
      default: { templates: [] },
      onChange: () => Hooks.callAll(HOOKS.TRACKERS_UPDATED)
    });

    game.settings.register(MODULE_ID, SETTINGS.LAST_CREATE, {
      scope: "client",
      config: false,
      type: Object,
      default: { npcUuid: "", pcUuid: "", templateId: DEFAULT_TEMPLATE_ID }
    });

    game.settings.register(MODULE_ID, SETTINGS.LOG_TIME, {
      name: `${I18N_PREFIX}.Settings.logTime.name`,
      hint: `${I18N_PREFIX}.Settings.logTime.hint`,
      scope: "world",
      config: true,
      restricted: true,
      type: new foundry.data.fields.StringField({
        required: true,
        blank: false,
        initial: LOG_TIME_MODES.BOTH,
        choices: {
          [LOG_TIME_MODES.BOTH]: `${I18N_PREFIX}.Settings.logTime.both`,
          [LOG_TIME_MODES.WORLD]: `${I18N_PREFIX}.Settings.logTime.world`,
          [LOG_TIME_MODES.REAL]: `${I18N_PREFIX}.Settings.logTime.real`
        }
      }),
      default: LOG_TIME_MODES.BOTH,
      onChange: () => Hooks.callAll(HOOKS.TRACKERS_UPDATED)
    });

    // Plain String with a choices object (not a StringField): the stored name must survive when
    // the field is deleted in the Campaign Builder, so the export can report exactly that.
    game.settings.register(MODULE_ID, SETTINGS.EXPORT_FIELD, {
      name: `${I18N_PREFIX}.Settings.exportField.name`,
      hint: `${I18N_PREFIX}.Settings.exportField.hint`,
      scope: "world",
      config: true,
      restricted: true,
      type: String,
      choices: ModuleSettings.#exportFieldChoices,
      default: "",
      onChange: () => ModuleSettings.refreshExportFieldChoices()
    });

    game.settings.register(MODULE_ID, SETTINGS.COLLAPSED, {
      scope: "client",
      config: false,
      type: Array,
      default: []
    });

    Hooks.on("updateSetting", setting => {
      if (setting.key === `${UPSTREAM.CAMPAIGN_BUILDER_ID}.${UPSTREAM.CUSTOM_FIELDS_SETTING}`) {
        ModuleSettings.refreshExportFieldChoices();
      }
    });
  }

  /**
   * Refill the EXPORT_FIELD dropdown from the Campaign Builder's current character editor fields.
   * A stored field that no longer exists stays selectable, marked as missing. Call from `ready`.
   */
  static refreshExportFieldChoices() {
    const choices = ModuleSettings.#exportFieldChoices;
    for (const key of Object.keys(choices)) delete choices[key];
    choices[""] = game.i18n.localize(`${I18N_PREFIX}.Settings.exportField.none`);
    for (const field of CampaignBuilderBridge.characterEditorFields()) {
      choices[field.name] = game.i18n.localize(field.label);
    }
    const current = ModuleSettings.exportField;
    if (current && !(current in choices)) {
      choices[current] = game.i18n.format(`${I18N_PREFIX}.Settings.exportField.missing`, { field: current });
    }
  }

  /** @returns {Set<string>} Ids of the trackers collapsed in the panel (this client). */
  static get collapsed() {
    const ids = game.settings.get(MODULE_ID, SETTINGS.COLLAPSED);
    return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === "string") : []);
  }

  /**
   * Remember which trackers are collapsed in the panel.
   * @param {Iterable<string>} ids
   * @returns {Promise<string[]>}
   */
  static async setCollapsed(ids) {
    return game.settings.set(MODULE_ID, SETTINGS.COLLAPSED, [...ids]);
  }

  /** @returns {string} Name of the Campaign Builder character field the history is exported to; empty when not set. */
  static get exportField() {
    return game.settings.get(MODULE_ID, SETTINGS.EXPORT_FIELD) ?? "";
  }

  /** @returns {string} Which time log entries show, one of LOG_TIME_MODES. */
  static get logTime() {
    return game.settings.get(MODULE_ID, SETTINGS.LOG_TIME);
  }

  /** @returns {import("./tracker/tracker-math.mjs").Tracker[]} Source data of all stored trackers (a copy). */
  static get trackers() {
    return game.settings.get(MODULE_ID, SETTINGS.TRACKERS).toObject().trackers;
  }

  /**
   * Replace all stored trackers. Validates via {@link TrackerCollection}.
   * @param {import("./tracker/tracker-math.mjs").Tracker[]} trackers
   * @returns {Promise<TrackerCollection>}
   */
  static async setTrackers(trackers) {
    return game.settings.set(MODULE_ID, SETTINGS.TRACKERS, { trackers });
  }

  /** @returns {import("./tracker/tracker-templates.mjs").TrackerTemplate[]} Source data of the custom templates (a copy). */
  static get customTemplates() {
    return game.settings.get(MODULE_ID, SETTINGS.TEMPLATES).toObject().templates;
  }

  /**
   * Replace all custom templates. Validates via {@link TemplateCollection}.
   * @param {import("./tracker/tracker-templates.mjs").TrackerTemplate[]} templates
   * @returns {Promise<TemplateCollection>}
   */
  static async setCustomTemplates(templates) {
    return game.settings.set(MODULE_ID, SETTINGS.TEMPLATES, { templates });
  }

  /** @returns {{npcUuid: string, pcUuid: string, templateId: string}} The create dialog's last choices (this client). */
  static get lastCreate() {
    return game.settings.get(MODULE_ID, SETTINGS.LAST_CREATE);
  }

  /**
   * Remember the create dialog's choices.
   * @param {{npcUuid: string, pcUuid: string, templateId: string}} value
   * @returns {Promise<object>}
   */
  static async setLastCreate(value) {
    return game.settings.set(MODULE_ID, SETTINGS.LAST_CREATE, value);
  }
}
