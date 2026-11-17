/**
 * Entry point. Registers hooks only; all logic lives in dedicated classes.
 * @module main
 */
import { MODULE_ID, UPSTREAM } from "./constants.mjs";
import { Logger } from "./logger.mjs";
import { ModuleSettings } from "./settings.mjs";
import { CampaignBuilderBridge } from "./integration/campaign-builder-bridge.mjs";
import { EntryPoints } from "./entry-points.mjs";
import { TrackerForm } from "./apps/tracker-form.mjs";
import { TrackerPanel } from "./apps/tracker-panel.mjs";
import { TrackerMath } from "./tracker/tracker-math.mjs";
import { TrackerStore } from "./tracker/tracker-store.mjs";
import { TrackerTemplates } from "./tracker/tracker-templates.mjs";
import { HistoryExport } from "./tracker/history-export.mjs";

/**
 * Public API, exposed as `game.modules.get("fcb-npc-trackers").api`.
 * Writing methods only work for GMs.
 */
class TrackerApi {
  /** Pure helpers (click rules, normalization). */
  TrackerMath = TrackerMath;

  /** Built-in templates and the template builder. */
  TrackerTemplates = TrackerTemplates;

  /**
   * Open the tracker panel (GM only).
   * @param {{npcUuid?: string}} [options]  Filter the list to one NPC.
   * @returns {TrackerPanel|null}
   */
  openPanel(options) {
    return TrackerPanel.open(options);
  }

  /**
   * Open the dialog for a new tracker (GM only).
   * @param {{npcUuid?: string}} [options]  Preselected NPC.
   * @returns {Promise<TrackerForm>}
   */
  openCreateDialog(options) {
    return TrackerForm.open(options);
  }

  /** @returns {import("./tracker/tracker-templates.mjs").TrackerTemplate[]} Built-in plus custom templates. */
  get templates() {
    return TrackerStore.templates;
  }

  /**
   * @param {import("./tracker/tracker-store.mjs").TrackerFilter} [filter]
   * @returns {import("./tracker/tracker-math.mjs").Tracker[]}
   */
  list(filter) {
    return TrackerStore.list(filter);
  }

  /**
   * @param {string} trackerId
   * @returns {import("./tracker/tracker-math.mjs").Tracker|undefined}
   */
  get(trackerId) {
    return TrackerStore.get(trackerId);
  }

  /**
   * Create a tracker, e.g. `api.createTracker({ npcUuid, pcUuid })` for sympathy/antipathy.
   * @param {Parameters<typeof TrackerStore.createFromTemplate>[0]} options
   * @returns {Promise<import("./tracker/tracker-math.mjs").Tracker>}
   */
  createTracker(options) {
    return TrackerStore.createFromTemplate(options);
  }

  /**
   * Set a bar to an absolute value, with an optional note.
   * @param {string} trackerId
   * @param {string} barId
   * @param {number} value
   * @param {string} [note]
   * @returns {Promise<import("./tracker/tracker-math.mjs").LogEntry|null>}
   */
  setValue(trackerId, barId, value, note) {
    return TrackerStore.setValue(trackerId, barId, value, note);
  }

  /**
   * Change a bar by a relative amount, with an optional note.
   * @param {string} trackerId
   * @param {string} barId
   * @param {number} delta
   * @param {string} [note]
   * @returns {Promise<import("./tracker/tracker-math.mjs").LogEntry|null>}
   */
  stepBar(trackerId, barId, delta, note) {
    return TrackerStore.stepBar(trackerId, barId, delta, note);
  }

  /**
   * Set the note of an existing log entry.
   * @param {string} trackerId
   * @param {string} logId
   * @param {string} note
   * @returns {Promise<boolean>}
   */
  setNote(trackerId, logId, note) {
    return TrackerStore.setNote(trackerId, logId, note);
  }

  /**
   * Delete a log entry including its note. Bar values stay as they are.
   * @param {string} trackerId
   * @param {string} logId
   * @returns {Promise<boolean>}
   */
  removeLogEntry(trackerId, logId) {
    return TrackerStore.removeLogEntry(trackerId, logId);
  }

  /**
   * Show or hide a tracker in the session panel.
   * @param {string} trackerId
   * @param {boolean} active
   * @returns {Promise<boolean>}
   */
  setActive(trackerId, active) {
    return TrackerStore.setActive(trackerId, active);
  }

  /**
   * Remove a tracker (restorable with {@link TrackerApi#restore} for a few seconds).
   * @param {string} trackerId
   * @returns {Promise<boolean>}
   */
  removeTracker(trackerId) {
    return TrackerStore.remove(trackerId);
  }

  /**
   * Undo a recent removal.
   * @param {string} trackerId
   * @returns {Promise<boolean>}
   */
  restore(trackerId) {
    return TrackerStore.restore(trackerId);
  }

  /**
   * Write the history of all trackers of an NPC into the Campaign Builder field chosen in the
   * module settings (overwrites the field).
   * @param {string} npcUuid  UUID of the NPC's Campaign Builder entry.
   * @returns {Promise<import("./tracker/history-export.mjs").ExportResult>}
   */
  exportHistory(npcUuid) {
    return HistoryExport.exportNpc(npcUuid);
  }

  /**
   * Trackers whose NPC or PC no longer exists in the Campaign Builder.
   * @returns {Promise<Map<string, {npcMissing: boolean, pcMissing: boolean}>>}
   */
  findOrphans() {
    return TrackerStore.findOrphans();
  }
}

Hooks.once("init", () => {
  ModuleSettings.register();
  EntryPoints.register();
  game.modules.get(MODULE_ID).api = new TrackerApi();
  Logger.info("Initialized.");
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  ModuleSettings.refreshExportFieldChoices();
  if (!CampaignBuilderBridge.isActive) {
    Logger.warn(`Inactive: requires the "${UPSTREAM.CAMPAIGN_BUILDER_ID}" module.`);
    return;
  }
  Logger.info(`Ready (${TrackerStore.list().length} trackers).`);
});
