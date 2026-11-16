/**
 * Session panel: all trackers at a glance, filterable per NPC. Click a box to set a
 * value, type a note into any log entry, remove with one click (short undo).
 * @module apps/tracker-panel
 */
import { HOOKS, I18N_PREFIX, MODULE_ID, TEMPLATES, UNDO_SECONDS } from "../constants.mjs";
import { Logger } from "../logger.mjs";
import { CampaignBuilderBridge } from "../integration/campaign-builder-bridge.mjs";
import { TrackerMath } from "../tracker/tracker-math.mjs";
import { TrackerStore } from "../tracker/tracker-store.mjs";
import { TrackerForm } from "./tracker-form.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Neutral color for log entries whose bar no longer exists. */
const FALLBACK_COLOR = "#888888";

export class TrackerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The panel instance, kept between openings. @type {TrackerPanel|null} */
  static #instance = null;

  /** UUID of the NPC the list is filtered to; empty shows all. */
  #filterNpc = "";

  /**
   * Campaign Builder entries by UUID; null marks an entry that no longer exists.
   * @type {Map<string, {name: string, playerName: string}|null>}
   */
  #names = new Map();

  /** Last removed tracker that can still be restored from the panel. @type {{trackerId: string, name: string, timer: number}|null} */
  #undo = null;

  /** Whether the "set aside" section is expanded. */
  #asideOpen = false;

  /** Id of the registered TRACKERS_UPDATED hook. @type {number|null} */
  #hookId = null;


  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-panel`,
    classes: ["fcb-npc-trackers", "fcb-npc-trackers-panel"],
    window: {
      title: `${I18N_PREFIX}.Panel.title`,
      icon: "fa-solid fa-people-arrows",
      resizable: true
    },
    position: { width: 580, height: 560 },
    actions: {
      clickBox: TrackerPanel.#onClickBox,
      stepBar: TrackerPanel.#onStepBar,
      toggleActive: TrackerPanel.#onToggleActive,
      removeTracker: TrackerPanel.#onRemoveTracker,
      undoRemove: TrackerPanel.#onUndoRemove,
      addTracker: TrackerPanel.#onAddTracker,
      editTracker: TrackerPanel.#onEditTracker
    }
  };

  /** @override */
  static PARTS = {
    panel: {
      template: TEMPLATES.PANEL,
      templates: [TEMPLATES.CARD],
      scrollable: [".fcb-npc-trackers-panel__list"]
    }
  };

  /**
   * Open the panel (GM only), optionally filtered to one NPC.
   * @param {{npcUuid?: string}} [options]  `npcUuid` filters the list; an empty string clears the filter.
   * @returns {TrackerPanel|null}
   */
  static open({ npcUuid } = {}) {
    if (!game.user.isGM) return null;
    const panel = (TrackerPanel.#instance ??= new TrackerPanel());
    if (npcUuid !== undefined) panel.#filterNpc = npcUuid;
    panel.render({ force: true });
    return panel;
  }

  /**
   * Close the panel when it is open, otherwise open it.
   * @returns {Promise<void>|TrackerPanel|null}
   */
  static toggle() {
    const panel = TrackerPanel.#instance;
    return panel?.rendered ? panel.close() : TrackerPanel.open();
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const all = TrackerStore.list();
    await this.#resolveNames(all);

    const npcKeys = new Set(all.map(t => TrackerMath.npcKey(t)).filter(Boolean));
    if (this.#filterNpc) npcKeys.add(this.#filterNpc);
    const npcChoices = [...npcKeys]
      .map(key => ({ value: key, label: this.#keyLabel(key) }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));

    const visible = all.filter(t => !this.#filterNpc || TrackerMath.npcKey(t) === this.#filterNpc);
    return Object.assign(context, {
      npcChoices,
      filter: this.#filterNpc,
      allLabel: game.i18n.localize(`${I18N_PREFIX}.Panel.filterAll`),
      cards: visible.filter(t => t.active).map(t => this.#card(t)),
      aside: visible.filter(t => !t.active).map(t => this.#card(t)),
      asideOpen: this.#asideOpen,
      undo: this.#undo ? { trackerId: this.#undo.trackerId, name: this.#undo.name } : null
    });
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#names.clear();
    this.#hookId = Hooks.on(HOOKS.TRACKERS_UPDATED, () => this.render());
    this.element.addEventListener("change", event => this.#onChange(event));
    this.element.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches?.("input[data-note]")) event.target.blur();
    });
    // `toggle` does not bubble, so listen in the capture phase.
    this.element.addEventListener(
      "toggle",
      event => {
        if (event.target.matches?.(".fcb-npc-trackers-panel__aside")) this.#asideOpen = event.target.open;
      },
      true
    );
  }

  /** @override */
  _onClose(options) {
    if (this.#hookId !== null) Hooks.off(HOOKS.TRACKERS_UPDATED, this.#hookId);
    this.#hookId = null;
    this.#clearUndo();
    super._onClose(options);
  }

  /**
   * Handle the NPC filter and note inputs (delegated: the content is re-rendered often).
   * @param {Event} event
   */
  #onChange(event) {
    const target = event.target;
    if (target.name === "filterNpc") {
      this.#filterNpc = target.value;
      this.render();
    } else if (target.matches?.("input[data-note]")) {
      const { trackerId, logId } = target.dataset;
      TrackerPanel.#run(TrackerStore.setNote(trackerId, logId, target.value));
    }
  }

  /**
   * Look up the names of all pages the given trackers refer to (cached while the panel is open).
   * @param {import("../tracker/tracker-math.mjs").Tracker[]} trackers
   */
  async #resolveNames(trackers) {
    const wanted = new Set(trackers.flatMap(t => [t.npcUuid, t.pcUuid]).filter(Boolean));
    if (this.#filterNpc && !this.#filterNpc.startsWith(TrackerMath.NAME_KEY_PREFIX)) wanted.add(this.#filterNpc);
    await Promise.all(
      [...wanted]
        .filter(uuid => !this.#names.has(uuid))
        .map(async uuid => {
          const entry = await CampaignBuilderBridge.resolve(uuid);
          this.#names.set(uuid, entry ? { name: entry.name, playerName: CampaignBuilderBridge.playerName(entry) } : null);
        })
    );
  }

  /**
   * Label of a filter key (see TrackerMath.npcKey): a manual name or the name of a CB entry.
   * @param {string} key
   * @returns {string}
   */
  #keyLabel(key) {
    const prefix = TrackerMath.NAME_KEY_PREFIX;
    return key.startsWith(prefix) ? key.slice(prefix.length) : this.#displayName(key, "missingNpc");
  }

  /**
   * Display name of an NPC or PC: the CB name while a uuid is set, otherwise the manual name.
   * @param {string|null} uuid
   * @param {string} manualName
   * @param {"missingNpc"|"missingPc"} missingKey
   * @returns {string}
   */
  #who(uuid, manualName, missingKey) {
    return uuid ? this.#displayName(uuid, missingKey) : manualName;
  }

  /**
   * @param {string} uuid
   * @param {"missingNpc"|"missingPc"} missingKey  i18n key shown when the page no longer exists.
   * @returns {string}
   */
  #displayName(uuid, missingKey) {
    return this.#names.get(uuid)?.name ?? game.i18n.localize(`${I18N_PREFIX}.Panel.${missingKey}`);
  }

  /**
   * Render context of one tracker card.
   * @param {import("../tracker/tracker-math.mjs").Tracker} tracker
   * @returns {object}
   */
  #card(tracker) {
    const t = text => game.i18n.localize(text);
    const colors = new Map(tracker.bars.map(bar => [bar.id, bar.color]));
    const dateFormat = new Intl.DateTimeFormat(game.i18n.lang, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    return {
      id: tracker.id,
      active: tracker.active,
      npcName: this.#who(tracker.npcUuid, tracker.npcName, "missingNpc"),
      npcMissing: Boolean(tracker.npcUuid) && this.#names.get(tracker.npcUuid) == null,
      hasPc: Boolean(tracker.pcUuid || tracker.pcName),
      pcName: this.#who(tracker.pcUuid, tracker.pcName, "missingPc"),
      pcMissing: Boolean(tracker.pcUuid) && this.#names.get(tracker.pcUuid) == null,
      playerName: tracker.pcUuid ? (this.#names.get(tracker.pcUuid)?.playerName ?? "") : "",
      subtitle: tracker.name ? t(tracker.name) : "",
      bars: tracker.bars.map(bar => {
        const label = t(bar.label);
        return {
          id: bar.id,
          trackerId: tracker.id,
          label,
          color: bar.color,
          value: bar.value,
          steps: bar.steps,
          canDecrease: bar.value > 0,
          canIncrease: bar.value < bar.steps,
          boxes: TrackerMath.boxes(bar.value, bar.steps).map(box => ({
            ...box,
            trackerId: tracker.id,
            barId: bar.id,
            ariaLabel: game.i18n.format(`${I18N_PREFIX}.Card.boxLabel`, { label, index: box.index, steps: bar.steps })
          }))
        };
      }),
      log: tracker.log
        .slice()
        .reverse()
        .map(entry => ({
          id: entry.id,
          trackerId: tracker.id,
          label: t(entry.label),
          from: entry.from,
          to: entry.to,
          icon: entry.to > entry.from ? "fa-arrow-up" : "fa-arrow-down",
          color: colors.get(entry.barId) ?? FALLBACK_COLOR,
          note: entry.note,
          time: dateFormat.format(entry.at)
        }))
    };
  }

  /**
   * Run a store call and show errors to the GM instead of failing silently.
   * @param {Promise<unknown>} promise
   * @returns {Promise<unknown>}
   */
  static async #run(promise) {
    try {
      return await promise;
    } catch (err) {
      Logger.error(err);
      ui.notifications.error(err.message, { console: false });
    }
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Box button with `data-tracker-id`, `data-bar-id`, `data-index`.
   */
  static #onClickBox(_event, target) {
    const { trackerId, barId, index } = target.dataset;
    return TrackerPanel.#run(TrackerStore.clickBar(trackerId, barId, Number(index)));
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  +/- button with `data-tracker-id`, `data-bar-id`, `data-delta`.
   */
  static #onStepBar(_event, target) {
    const { trackerId, barId, delta } = target.dataset;
    return TrackerPanel.#run(TrackerStore.stepBar(trackerId, barId, Number(delta)));
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id` and the wanted state in `data-active`.
   */
  static #onToggleActive(_event, target) {
    const { trackerId, active } = target.dataset;
    return TrackerPanel.#run(TrackerStore.setActive(trackerId, active === "true"));
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id`.
   */
  static async #onRemoveTracker(_event, target) {
    const { trackerId } = target.dataset;
    const tracker = TrackerStore.get(trackerId);
    if (!tracker) return;
    const npc = this.#who(tracker.npcUuid, tracker.npcName, "missingNpc");
    const pc = this.#who(tracker.pcUuid, tracker.pcName, "missingPc");
    const name = pc ? `${npc} ↔ ${pc}` : npc;
    if (await TrackerPanel.#run(TrackerStore.remove(trackerId))) this.#startUndo(trackerId, name);
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id`.
   */
  static async #onUndoRemove(_event, target) {
    await TrackerPanel.#run(TrackerStore.restore(target.dataset.trackerId));
    this.#clearUndo();
    this.render();
  }

  /** @this {TrackerPanel} */
  static #onAddTracker() {
    return TrackerForm.open({ npcUuid: this.#filterNpc || undefined });
  }

  /**
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id`.
   */
  static #onEditTracker(_event, target) {
    return TrackerPanel.#run(TrackerForm.open({ trackerId: target.dataset.trackerId }));
  }

  /**
   * Show the undo notice for a few seconds.
   * @param {string} trackerId
   * @param {string} name  Display name of the removed tracker.
   */
  #startUndo(trackerId, name) {
    this.#clearUndo();
    const timer = window.setTimeout(() => {
      if (this.#undo?.trackerId !== trackerId) return;
      this.#undo = null;
      if (this.rendered) this.render();
    }, UNDO_SECONDS * 1000);
    this.#undo = { trackerId, name, timer };
    this.render();
  }

  /** Forget the pending undo notice. */
  #clearUndo() {
    if (this.#undo) window.clearTimeout(this.#undo.timer);
    this.#undo = null;
  }
}
