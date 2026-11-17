/**
 * Central constants for the module. Import from here instead of repeating literals.
 * Pure data only: no Foundry globals, so it can be imported by unit tests.
 * @module constants
 */

/** Module id as declared in module.json. */
export const MODULE_ID = "fcb-npc-trackers";

/** Prefix for i18n keys. */
export const I18N_PREFIX = "FCB_NPC_TRACKERS";

/** Ids and keys of the upstream packages we integrate with. */
export const UPSTREAM = Object.freeze({
  /** World & Campaign Builder module id. */
  CAMPAIGN_BUILDER_ID: "campaign-builder",
  /** First Campaign Builder version flagged compatible with Foundry v14. */
  CAMPAIGN_BUILDER_MIN_VERSION: "1.10.1",
  /** Label prefix of the world compendium the Campaign Builder creates for every setting. */
  PACK_LABEL_PREFIX: "FCB - ",
  /** Journal entry flag (below the Campaign Builder's id) that marks what a journal entry is. */
  TYPE_FLAG: "campaignBuilderType",
  /** Value of that flag for NPC/PC/location/organization entries. */
  ENTRY_TYPE: "campaign-builder.entry2",
  /** Fallback values of the Campaign Builder `Topics` enum (the live ones come from `api.TOPICS`). */
  TOPIC_FALLBACK: Object.freeze({ CHARACTER: 1, PC: 4 })
});

/** Hard limits of the data model. */
export const LIMITS = Object.freeze({
  /** Maximum number of bars per tracker. */
  MAX_BARS: 6,
  /** Maximum number of steps per bar. */
  MAX_STEPS: 12,
  /** Maximum number of log entries kept per tracker (oldest are dropped first). */
  MAX_LOG: 200,
  /** Maximum length of a manual NPC/PC name. */
  MAX_NAME: 80
});

/** Keys of this module's settings. */
export const SETTINGS = Object.freeze({
  /** World setting holding the TrackerCollection. */
  TRACKERS: "trackers",
  /** World setting holding the custom TrackerTemplates. */
  TEMPLATES: "templates",
  /** Client setting remembering the last choices of the create dialog. */
  LAST_CREATE: "lastCreate",
  /** World setting: which time log entries show (see LOG_TIME_MODES). */
  LOG_TIME: "logTime"
});

/** Values of the LOG_TIME setting. */
export const LOG_TIME_MODES = Object.freeze({
  /** In-world time from the world calendar, real time as tooltip. */
  WORLD: "world",
  /** Real date and time only. */
  REAL: "real",
  /** In-world time with the real time below it. */
  BOTH: "both"
});

/** Keys of this module's keybindings. */
export const KEYBINDINGS = Object.freeze({
  /** Toggle the tracker panel. */
  OPEN_PANEL: "openPanel"
});

/** Custom hooks fired by this module. */
export const HOOKS = Object.freeze({
  /** Fired with (tracker, logEntry) after a bar value changed. */
  TRACKER_CHANGED: `${MODULE_ID}.trackerChanged`,
  /** Fired with the removed tracker's source data after it was removed. */
  TRACKER_REMOVED: `${MODULE_ID}.trackerRemoved`,
  /** Fired without arguments whenever the stored trackers changed (on every client). */
  TRACKERS_UPDATED: `${MODULE_ID}.trackersUpdated`
});

/** Id of the built-in default template. */
export const DEFAULT_TEMPLATE_ID = "sympathy-antipathy";

/** Fallback bar color. */
export const DEFAULT_BAR_COLOR = "#4a7fb5";

/** Seconds a removed tracker can be restored. */
export const UNDO_SECONDS = 8;

/** Template paths. */
export const TEMPLATES = Object.freeze({
  PANEL: `modules/${MODULE_ID}/templates/tracker-panel.hbs`,
  CARD: `modules/${MODULE_ID}/templates/tracker-card.hbs`,
  FORM: `modules/${MODULE_ID}/templates/tracker-form.hbs`
});
