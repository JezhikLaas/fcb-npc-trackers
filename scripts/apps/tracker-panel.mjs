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
import { LogTimeFormat } from "../tracker/log-time-format.mjs";
import { HistoryExport } from "../tracker/history-export.mjs";
import { ModuleSettings } from "../settings.mjs";
import { TrackerForm } from "./tracker-form.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Neutral color for log entries whose bar no longer exists. */
const FALLBACK_COLOR = "#888888";

export class TrackerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The panel instance, kept between openings. @type {TrackerPanel|null} */
  static #instance = null;

  /** Key of the NPC the list is filtered to (see TrackerMath.npcKey); empty shows all. */
  #filterNpc = "";

  /** Key of the PC the list is filtered to (see TrackerMath.pcKey); empty shows all. */
  #filterPc = "";

  /**
   * Campaign Builder entries by UUID; null marks an entry that no longer exists.
   * @type {Map<string, {name: string, playerName: string}|null>}
   */
  #names = new Map();

  /** Last removed tracker that can still be restored from the panel. @type {{trackerId: string, name: string, timer: number}|null} */
  #undo = null;

  /** Whether the "set aside" section is expanded. */
  #asideOpen = false;

  /** Tracker being dragged and whether it is in the "set aside" section. @type {{id: string, aside: boolean}|null} */
  #drag = null;

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
      removeLogEntry: TrackerPanel.#onRemoveLogEntry,
      undoRemove: TrackerPanel.#onUndoRemove,
      addTracker: TrackerPanel.#onAddTracker,
      editTracker: TrackerPanel.#onEditTracker,
      exportHistory: TrackerPanel.#onExportHistory,
      toggleCollapse: TrackerPanel.#onToggleCollapse
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
   * Open the panel (GM only), optionally filtered to one NPC and/or PC.
   * @param {{npcUuid?: string, pcUuid?: string}} [options]  Filter the list by NPC / PC (uuid or `name:<text>`
   *   key); an empty string clears that filter, omitting it keeps the current one.
   * @returns {TrackerPanel|null}
   */
  static open({ npcUuid, pcUuid } = {}) {
    if (!game.user.isGM) return null;
    const panel = (TrackerPanel.#instance ??= new TrackerPanel());
    if (npcUuid !== undefined) panel.#filterNpc = npcUuid;
    if (pcUuid !== undefined) panel.#filterPc = pcUuid;
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

    const npcChoices = this.#choices(all, TrackerMath.npcKey, this.#filterNpc, "missingNpc");
    const pcChoices = this.#choices(all, TrackerMath.pcKey, this.#filterPc, "missingPc");

    const visible = all.filter(
      t =>
        (!this.#filterNpc || TrackerMath.npcKey(t) === this.#filterNpc) &&
        (!this.#filterPc || TrackerMath.pcKey(t) === this.#filterPc)
    );
    const collapsed = ModuleSettings.collapsed;
    const card = t => ({ ...this.#card(t), collapsed: collapsed.has(t.id) });
    return Object.assign(context, {
      npcChoices,
      pcChoices,
      filterNpc: this.#filterNpc,
      filterPc: this.#filterPc,
      allNpcLabel: game.i18n.localize(`${I18N_PREFIX}.Panel.filterAll`),
      allPcLabel: game.i18n.localize(`${I18N_PREFIX}.Panel.filterPcAll`),
      cards: visible.filter(t => t.active).map(card),
      aside: visible.filter(t => !t.active).map(card),
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
    this.#listenDragDrop();
  }

  /**
   * Reorder trackers by dragging a card's header onto another card (delegated listeners).
   * Cards can only be moved within their section (shown or set aside).
   */
  #listenDragDrop() {
    const el = this.element;
    el.addEventListener("dragstart", event => {
      const header = event.target.closest?.(".fcb-npc-trackers-card__header[draggable]");
      const card = header?.closest(".fcb-npc-trackers-card");
      if (!card) return;
      this.#drag = { id: card.dataset.trackerId, aside: card.classList.contains("is-aside") };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.trackerId);
      const rect = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
      card.classList.add("is-dragging");
    });
    el.addEventListener("dragover", event => {
      const drop = this.#dropTarget(event);
      if (!drop) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      this.#markDrop(drop.card, drop.after);
    });
    el.addEventListener("dragleave", event => {
      if (!el.contains(event.relatedTarget)) this.#markDrop(null);
    });
    el.addEventListener("drop", event => {
      const drop = this.#dropTarget(event);
      if (!drop) return;
      event.preventDefault();
      event.stopPropagation();
      const id = this.#drag.id;
      this.#endDrag();
      TrackerPanel.#run(TrackerStore.move(id, drop.card.dataset.trackerId, drop.after));
    });
    el.addEventListener("dragend", () => this.#endDrag());
  }

  /**
   * The card a dragged tracker would be dropped on, and on which half.
   * @param {DragEvent} event
   * @returns {{card: HTMLElement, after: boolean}|null}  Null when there is no valid target.
   */
  #dropTarget(event) {
    if (!this.#drag) return null;
    const card = event.target.closest?.(".fcb-npc-trackers-card");
    if (!card || card.dataset.trackerId === this.#drag.id) return null;
    if (card.classList.contains("is-aside") !== this.#drag.aside) return null;
    const rect = card.getBoundingClientRect();
    return { card, after: event.clientY > rect.top + rect.height / 2 };
  }

  /**
   * Show where a dropped card would land.
   * @param {HTMLElement|null} card  Target card; null clears the marker.
   * @param {boolean} [after]
   */
  #markDrop(card, after = false) {
    for (const marked of this.element.querySelectorAll(".is-drop-before, .is-drop-after")) {
      if (marked !== card) marked.classList.remove("is-drop-before", "is-drop-after");
    }
    card?.classList.toggle("is-drop-before", !after);
    card?.classList.toggle("is-drop-after", after);
  }

  /** Forget the dragged card and remove all drag markers. */
  #endDrag() {
    this.#drag = null;
    this.#markDrop(null);
    this.element.querySelector(".is-dragging")?.classList.remove("is-dragging");
  }

  /** @override */
  _onClose(options) {
    if (this.#hookId !== null) Hooks.off(HOOKS.TRACKERS_UPDATED, this.#hookId);
    this.#hookId = null;
    this.#clearUndo();
    super._onClose(options);
  }

  /**
   * Options of a filter select: every key of the trackers (plus the current filter, so it stays
   * selectable after its last tracker is gone), sorted by label.
   * @param {import("../tracker/tracker-math.mjs").Tracker[]} trackers
   * @param {(tracker: object) => string} keyOf      TrackerMath.npcKey or TrackerMath.pcKey.
   * @param {string} current                         Current filter key ("" for none).
   * @param {"missingNpc"|"missingPc"} missingKey    i18n key shown for a deleted CB entry.
   * @returns {{value: string, label: string}[]}
   */
  #choices(trackers, keyOf, current, missingKey) {
    const keys = new Set(trackers.map(keyOf).filter(Boolean));
    if (current) keys.add(current);
    return [...keys]
      .map(key => ({ value: key, label: this.#keyLabel(key, missingKey) }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /**
   * Handle the NPC/PC filters and note inputs (delegated: the content is re-rendered often).
   * @param {Event} event
   */
  #onChange(event) {
    const target = event.target;
    if (target.name === "filterNpc") {
      this.#filterNpc = target.value;
      this.render();
    } else if (target.name === "filterPc") {
      this.#filterPc = target.value;
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
    for (const key of [this.#filterNpc, this.#filterPc]) {
      if (key && !key.startsWith(TrackerMath.NAME_KEY_PREFIX)) wanted.add(key);
    }
    await Promise.all(
      [...wanted]
        .filter(uuid => !this.#names.has(uuid))
        .map(async uuid => {
          const entry = await CampaignBuilderBridge.resolve(uuid);
          this.#names.set(
            uuid,
            entry
              ? {
                  name: entry.name,
                  playerName: CampaignBuilderBridge.playerName(entry),
                  organization: CampaignBuilderBridge.isOrganization(entry)
                }
              : null
          );
        })
    );
  }

  /**
   * Label of a filter key (see TrackerMath.npcKey/pcKey): a manual name or the name of a CB entry.
   * @param {string} key
   * @param {"missingNpc"|"missingPc"} missingKey  i18n key shown when the page no longer exists.
   * @returns {string}
   */
  #keyLabel(key, missingKey) {
    const prefix = TrackerMath.NAME_KEY_PREFIX;
    if (key.startsWith(prefix)) return key.slice(prefix.length);
    const name = this.#displayName(key, missingKey);
    return this.#names.get(key)?.organization
      ? `${name} (${game.i18n.localize(`${I18N_PREFIX}.Form.organization`)})`
      : name;
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
    const mode = ModuleSettings.logTime;

    return {
      id: tracker.id,
      active: tracker.active,
      npcName: this.#who(tracker.npcUuid, tracker.npcName, "missingNpc"),
      npcMissing: Boolean(tracker.npcUuid) && this.#names.get(tracker.npcUuid) == null,
      npcOrganization: Boolean(tracker.npcUuid) && this.#names.get(tracker.npcUuid)?.organization === true,
      canExport: Boolean(tracker.npcUuid),
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
          ...LogTimeFormat.entry(entry, mode, dateFormat)
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
   * Delete a log entry after confirmation. The bar values stay unchanged.
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id` and `data-log-id`.
   */
  static async #onRemoveLogEntry(_event, target) {
    const { trackerId, logId } = target.dataset;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${I18N_PREFIX}.Card.removeEntry` },
      content: `<p>${game.i18n.localize(`${I18N_PREFIX}.Card.removeEntryConfirm`)}</p>`,
      rejectClose: false
    });
    if (ok) await TrackerPanel.#run(TrackerStore.removeLogEntry(trackerId, logId));
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
    return TrackerForm.open({ npcUuid: this.#filterNpc || undefined, pcUuid: this.#filterPc || undefined });
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
   * Write the history of all trackers of the card's NPC into the configured Campaign Builder field.
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLButtonElement} target  Button with `data-tracker-id`.
   */
  static async #onExportHistory(_event, target) {
    const tracker = TrackerStore.get(target.dataset.trackerId);
    if (!tracker) return;
    target.disabled = true;
    try {
      const result = await TrackerPanel.#run(HistoryExport.exportNpc(tracker.npcUuid));
      if (result) ui.notifications.info(game.i18n.format(`${I18N_PREFIX}.Export.done`, result));
    } finally {
      target.disabled = false;
    }
  }

  /**
   * Collapse or expand a card; the state is remembered per client.
   * @this {TrackerPanel}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button with `data-tracker-id`.
   */
  static async #onToggleCollapse(_event, target) {
    const { trackerId } = target.dataset;
    const known = new Set(TrackerStore.list().map(t => t.id));
    const collapsed = new Set([...ModuleSettings.collapsed].filter(id => known.has(id)));
    if (collapsed.has(trackerId)) collapsed.delete(trackerId);
    else collapsed.add(trackerId);
    await TrackerPanel.#run(ModuleSettings.setCollapsed(collapsed));
    this.render();
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
