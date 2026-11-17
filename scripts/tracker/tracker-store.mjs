/**
 * All reads and writes of trackers. Writes are GM-only and serialized, so quick
 * successive clicks never overwrite each other.
 * @module tracker/tracker-store
 */
import { DEFAULT_TEMPLATE_ID, HOOKS, I18N_PREFIX, LIMITS, UNDO_SECONDS } from "../constants.mjs";
import { CampaignBuilderBridge } from "../integration/campaign-builder-bridge.mjs";
import { ModuleSettings } from "../settings.mjs";
import { TrackerMath } from "./tracker-math.mjs";
import { TrackerTemplates } from "./tracker-templates.mjs";
import { WorldTime } from "./world-time.mjs";

/**
 * @typedef {import("./tracker-math.mjs").Tracker} Tracker
 * @typedef {import("./tracker-math.mjs").LogEntry} LogEntry
 */

/**
 * @typedef {object} TrackerFilter
 * @property {string} [npcUuid]     Only trackers of this NPC: a CB uuid or the key `name:<text>` of a manual NPC (see TrackerMath.npcKey).
 * @property {string} [pcUuid]      Only trackers with this PC.
 * @property {boolean} [activeOnly] Only trackers shown in the session panel.
 */

export class TrackerStore {
  /** Chain that serializes all writes. @type {Promise<unknown>} */
  static #queue = Promise.resolve();

  /** Recently removed trackers, newest last. @type {{tracker: Tracker, at: number}[]} */
  static #removed = [];

  /**
   * Trackers matching a filter, oldest first.
   * @param {TrackerFilter} [filter]
   * @returns {Tracker[]}
   */
  static list({ npcUuid, pcUuid, activeOnly = false } = {}) {
    return ModuleSettings.trackers.filter(
      t => (!npcUuid || TrackerMath.npcKey(t) === npcUuid) && (!pcUuid || t.pcUuid === pcUuid) && (!activeOnly || t.active)
    );
  }

  /**
   * @param {string} trackerId
   * @returns {Tracker|undefined}
   */
  static get(trackerId) {
    return ModuleSettings.trackers.find(t => t.id === trackerId);
  }

  /** @returns {import("./tracker-templates.mjs").TrackerTemplate[]} Built-in plus custom templates. */
  static get templates() {
    return [...TrackerTemplates.BUILTIN, ...ModuleSettings.customTemplates];
  }

  /**
   * Create a tracker from a template.
   * @param {object} options
   * @param {string} [options.npcUuid]  CB entry of the NPC. Either this or `npcName` is required.
   * @param {string} [options.npcName]  Manual NPC name, used when there is no `npcUuid`.
   * @param {string|null} [options.pcUuid]
   * @param {string} [options.pcName]  Manual PC name, used when there is no `pcUuid`.
   * @param {string} [options.templateId]  Defaults to the built-in sympathy/antipathy template.
   * @param {string} [options.name]
   * @returns {Promise<Tracker>}
   */
  static createFromTemplate({ npcUuid = "", npcName = "", pcUuid = null, pcName = "", templateId = DEFAULT_TEMPLATE_ID, name }) {
    return TrackerStore.#mutate(trackers => {
      const template = TrackerTemplates.find(TrackerStore.templates, templateId);
      if (!template) throw new Error(`Unknown tracker template "${templateId}".`);
      if (!npcUuid && !String(npcName).trim()) throw new Error("A tracker needs an NPC.");
      const tracker = TrackerTemplates.build(template, {
        npcUuid,
        npcName: npcUuid ? "" : npcName,
        pcUuid,
        pcName: pcUuid ? "" : pcName,
        name,
        idFactory: () => foundry.utils.randomID()
      });
      trackers.push(tracker);
      return { result: tracker, changed: true };
    });
  }

  /**
   * Create a tracker with explicitly given bars (the create dialog).
   * @param {object} options
   * @param {string} [options.npcUuid]  CB entry of the NPC. Either this or `npcName` is required.
   * @param {string} [options.npcName]  Manual NPC name, used when there is no `npcUuid`.
   * @param {string|null} [options.pcUuid]
   * @param {string} [options.pcName]  Manual PC name, used when there is no `pcUuid`.
   * @param {string} [options.name]  Optional tracker name; may be empty.
   * @param {{label: string, steps: number, color: string}[]} options.bars  1..LIMITS.MAX_BARS bars.
   * @returns {Promise<Tracker>}
   */
  static create({ npcUuid = "", npcName = "", pcUuid = null, pcName = "", name = "", bars }) {
    return TrackerStore.#mutate(trackers => {
      if (!npcUuid && !String(npcName).trim()) throw new Error("A tracker needs an NPC.");
      if (!bars?.length || bars.length > LIMITS.MAX_BARS) {
        throw new Error(`A tracker needs 1 to ${LIMITS.MAX_BARS} bars.`);
      }
      const tracker = TrackerTemplates.build(
        { id: "custom", name, bars },
        {
          npcUuid,
          npcName: npcUuid ? "" : npcName,
          pcUuid: pcUuid || null,
          pcName: pcUuid ? "" : pcName,
          name: String(name).trim(),
          idFactory: () => foundry.utils.randomID() }
      );
      trackers.push(tracker);
      return { result: tracker, changed: true };
    });
  }

  /**
   * Edit name, manual names, PC and bars of a tracker. Bars carrying the id of an existing bar keep their
   * value; bars without a known id are new (value 0); existing bars missing from `bars` are
   * removed. Log entries stay (they keep their label snapshot).
   * @param {string} trackerId
   * @param {object} changes
   * @param {string} [changes.name]
   * @param {string} [changes.npcName]  Only applied to trackers without an NPC uuid.
   * @param {string|null} [changes.pcUuid]
   * @param {string} [changes.pcName]  Applied only while the tracker has no PC uuid.
   * @param {{id?: string, label: string, steps: number, color: string}[]} [changes.bars]
   * @returns {Promise<boolean>}  Whether the tracker exists.
   */
  static updateTracker(trackerId, { name, npcName, pcUuid, pcName, bars }) {
    return TrackerStore.#mutate(trackers => {
      const tracker = trackers.find(t => t.id === trackerId);
      if (!tracker) return { result: false, changed: false };
      if (name !== undefined) tracker.name = String(name).trim();
      if (npcName !== undefined && !tracker.npcUuid) {
        if (!String(npcName).trim()) throw new Error("A tracker needs an NPC.");
        tracker.npcName = String(npcName).trim();
      }
      if (pcUuid !== undefined) tracker.pcUuid = pcUuid || null;
      if (pcName !== undefined) tracker.pcName = tracker.pcUuid ? "" : String(pcName).trim();
      if (pcUuid) tracker.pcName = "";
      if (bars) {
        if (!bars.length || bars.length > LIMITS.MAX_BARS) {
          throw new Error(`A tracker needs 1 to ${LIMITS.MAX_BARS} bars.`);
        }
        const existing = new Map(tracker.bars.map(b => [b.id, b]));
        tracker.bars = bars.map(draft => {
          const old = existing.get(draft.id);
          return {
            id: old?.id ?? foundry.utils.randomID(),
            label: draft.label,
            steps: draft.steps,
            color: draft.color,
            value: old?.value ?? 0
          };
        });
      }
      return { result: true, changed: true };
    });
  }

  /**
   * Set a bar to an absolute value and log the change. No-op when the value does not change.
   * @param {string} trackerId
   * @param {string} barId
   * @param {number} value
   * @param {string} [note]  Optional note for the log entry.
   * @returns {Promise<LogEntry|null>}  The new log entry, or null when nothing changed.
   */
  static setValue(trackerId, barId, value, note = "") {
    return TrackerStore.#changeBar(trackerId, barId, bar => TrackerMath.clampInt(value, 0, bar.steps), note);
  }

  /**
   * Handle a click on box `index` of a bar (see {@link TrackerMath.applyClick}).
   * @param {string} trackerId
   * @param {string} barId
   * @param {number} index  Clicked box, 1-based from the bottom.
   * @param {string} [note]
   * @returns {Promise<LogEntry|null>}
   */
  static clickBar(trackerId, barId, index, note = "") {
    return TrackerStore.#changeBar(trackerId, barId, bar => TrackerMath.applyClick(bar.value, index, bar.steps), note);
  }

  /**
   * Change a bar by a relative amount (the +/- buttons).
   * @param {string} trackerId
   * @param {string} barId
   * @param {number} delta
   * @param {string} [note]
   * @returns {Promise<LogEntry|null>}
   */
  static stepBar(trackerId, barId, delta, note = "") {
    return TrackerStore.#changeBar(trackerId, barId, bar => TrackerMath.step(bar.value, delta, bar.steps), note);
  }

  /**
   * Set or clear the note of an existing log entry.
   * @param {string} trackerId
   * @param {string} logId
   * @param {string} note
   * @returns {Promise<boolean>}  Whether the entry exists.
   */
  static setNote(trackerId, logId, note) {
    return TrackerStore.#mutate(trackers => {
      const entry = trackers.find(t => t.id === trackerId)?.log.find(l => l.id === logId);
      if (!entry) return { result: false, changed: false };
      entry.note = String(note ?? "").trim();
      return { result: true, changed: true };
    });
  }

  /**
   * Delete one log entry (with its note). Bar values are not touched.
   * @param {string} trackerId
   * @param {string} logId
   * @returns {Promise<boolean>}  Whether the entry existed.
   */
  static removeLogEntry(trackerId, logId) {
    return TrackerStore.#mutate(trackers => {
      const tracker = trackers.find(t => t.id === trackerId);
      const index = tracker?.log.findIndex(l => l.id === logId) ?? -1;
      if (index < 0) return { result: false, changed: false };
      tracker.log.splice(index, 1);
      return { result: true, changed: true };
    });
  }

  /**
   * Show or hide a tracker in the session panel (prepared but set aside).
   * @param {string} trackerId
   * @param {boolean} active
   * @returns {Promise<boolean>}  Whether the tracker exists.
   */
  static setActive(trackerId, active) {
    return TrackerStore.#mutate(trackers => {
      const tracker = trackers.find(t => t.id === trackerId);
      if (!tracker) return { result: false, changed: false };
      tracker.active = Boolean(active);
      return { result: true, changed: true };
    });
  }

  /**
   * Remove a tracker. It can be restored with {@link TrackerStore.restore} for a few seconds.
   * @param {string} trackerId
   * @returns {Promise<boolean>}  Whether the tracker existed.
   */
  static remove(trackerId) {
    return TrackerStore.#mutate(trackers => {
      const index = trackers.findIndex(t => t.id === trackerId);
      if (index < 0) return { result: false, changed: false };
      const [removed] = trackers.splice(index, 1);
      TrackerStore.#removed.push({ tracker: structuredClone(removed), at: Date.now() });
      TrackerStore.#removed = TrackerStore.#removed.slice(-10);
      return { result: true, changed: true, after: () => Hooks.callAll(HOOKS.TRACKER_REMOVED, removed) };
    });
  }

  /**
   * Undo a removal made less than {@link UNDO_SECONDS} ago.
   * @param {string} trackerId
   * @returns {Promise<boolean>}  Whether the tracker was restored.
   */
  static restore(trackerId) {
    return TrackerStore.#mutate(trackers => {
      const cutoff = Date.now() - UNDO_SECONDS * 1000;
      const index = TrackerStore.#removed.findIndex(r => r.tracker.id === trackerId && r.at >= cutoff);
      if (index < 0 || trackers.some(t => t.id === trackerId)) return { result: false, changed: false };
      const [{ tracker }] = TrackerStore.#removed.splice(index, 1);
      trackers.push(tracker);
      return { result: true, changed: true };
    });
  }

  /**
   * Find trackers whose NPC or PC page no longer exists in the Campaign Builder (manual names are never orphaned).
   * Nothing is changed or removed.
   * @returns {Promise<Map<string, {npcMissing: boolean, pcMissing: boolean}>>}  Keyed by tracker id; only broken trackers.
   */
  static async findOrphans() {
    const orphans = new Map();
    for (const tracker of TrackerStore.list()) {
      const [npc, pc] = await Promise.all([
        tracker.npcUuid ? CampaignBuilderBridge.resolve(tracker.npcUuid) : Promise.resolve(true),
        tracker.pcUuid ? CampaignBuilderBridge.resolve(tracker.pcUuid) : Promise.resolve(true)
      ]);
      if (!npc || !pc) orphans.set(tracker.id, { npcMissing: !npc, pcMissing: !pc });
    }
    return orphans;
  }

  /**
   * Apply a bar change and log it.
   * @param {string} trackerId
   * @param {string} barId
   * @param {(bar: import("./tracker-math.mjs").Bar) => number} computeValue  Returns the new value.
   * @param {string} note
   * @returns {Promise<LogEntry|null>}
   */
  static #changeBar(trackerId, barId, computeValue, note) {
    return TrackerStore.#mutate(trackers => {
      const tracker = trackers.find(t => t.id === trackerId);
      const bar = tracker?.bars.find(b => b.id === barId);
      if (!bar) return { result: null, changed: false };
      const to = computeValue(bar);
      if (to === bar.value) return { result: null, changed: false };
      /** @type {LogEntry} */
      const entry = {
        id: foundry.utils.randomID(),
        barId: bar.id,
        label: bar.label,
        from: bar.value,
        to,
        note: String(note ?? "").trim(),
        at: Date.now(),
        worldTime: WorldTime.toStored(game.time?.worldTime)
      };
      bar.value = to;
      tracker.log.push(entry);
      return { result: entry, changed: true, after: () => Hooks.callAll(HOOKS.TRACKER_CHANGED, tracker, entry) };
    });
  }

  /**
   * Run a read-modify-write on the stored trackers, serialized with all other writes.
   * @template T
   * @param {(trackers: Tracker[]) => {result: T, changed: boolean, after?: () => void}} fn
   *   Mutates the given copy and reports whether anything must be saved.
   * @returns {Promise<T>}
   */
  static #mutate(fn) {
    const run = async () => {
      if (!game.user.isGM) throw new Error(game.i18n.localize(`${I18N_PREFIX}.Errors.gmOnly`));
      const trackers = ModuleSettings.trackers;
      const { result, changed, after } = fn(trackers);
      if (changed) {
        await ModuleSettings.setTrackers(trackers.map(t => TrackerMath.normalize(t)));
        after?.();
      }
      return result;
    };
    const promise = TrackerStore.#queue.then(run);
    TrackerStore.#queue = promise.catch(() => {});
    return promise;
  }
}
