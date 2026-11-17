/**
 * Pure tracker logic: step clicks, clamping, normalization. No Foundry globals,
 * so everything here is covered by `npm test`.
 * @module tracker/tracker-math
 */
import { DEFAULT_BAR_COLOR, LIMITS } from "../constants.mjs";

/**
 * @typedef {object} Bar
 * @property {string} id
 * @property {string} label    i18n key or plain text.
 * @property {number} steps    Number of boxes, 1..LIMITS.MAX_STEPS.
 * @property {number} value    Filled boxes, 0..steps.
 * @property {string} color    CSS color.
 */

/**
 * @typedef {object} LogEntry
 * @property {string} id
 * @property {string} barId
 * @property {string} label    Bar label at the time of the change (kept when the bar is renamed or removed).
 * @property {number} from
 * @property {number} to
 * @property {string} note     Optional free text.
 * @property {number} at       Real timestamp in ms.
 * @property {number|null} [worldTime]  In-world time (`game.time.worldTime`, seconds) of the change; missing on old entries.
 */

/**
 * @typedef {object} Tracker
 * @property {string} id
 * @property {string} name
 * @property {string} npcUuid      CB entry of the NPC; empty for a manual NPC.
 * @property {string} npcName      Manual NPC name, used while `npcUuid` is empty.
 * @property {string|null} pcUuid  CB entry of the PC; null when none.
 * @property {string} pcName       Manual PC name, used while `pcUuid` is empty.
 * @property {boolean} active
 * @property {Bar[]} bars
 * @property {LogEntry[]} log
 * @property {number} createdAt
 */

export class TrackerMath {
  /** Prefix of filter keys that stand for a manual NPC name. */
  static NAME_KEY_PREFIX = "name:";

  /**
   * Clamp a number to an integer range. Non-finite input yields `min`.
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static clampInt(value, min, max) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  /**
   * New bar value after the user clicked box `index` (1-based, counted from the bottom).
   * Clicking a box below or above the current value sets it to that box;
   * clicking the topmost filled box takes one step back.
   * @param {number} value  Current value.
   * @param {number} index  Clicked box, 1..steps.
   * @param {number} steps  Number of boxes of the bar.
   * @returns {number}
   */
  static applyClick(value, index, steps) {
    const max = TrackerMath.clampInt(steps, 1, LIMITS.MAX_STEPS);
    const current = TrackerMath.clampInt(value, 0, max);
    const clicked = TrackerMath.clampInt(index, 1, max);
    return clicked === current ? clicked - 1 : clicked;
  }

  /**
   * New bar value after a relative change (the +/- buttons).
   * @param {number} value
   * @param {number} delta  Usually +1 or -1.
   * @param {number} steps
   * @returns {number}
   */
  static step(value, delta, steps) {
    const max = TrackerMath.clampInt(steps, 1, LIMITS.MAX_STEPS);
    return TrackerMath.clampInt(TrackerMath.clampInt(value, 0, max) + Number(delta), 0, max);
  }

  /**
   * @param {unknown} color
   * @returns {boolean}  Whether the value is a `#rrggbb` color.
   */
  static isColor(color) {
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);
  }

  /**
   * The boxes of a bar as drawn: topmost box first.
   * @param {number} value  Filled boxes.
   * @param {number} steps  Total boxes.
   * @returns {{index: number, filled: boolean}[]}  `index` is 1-based from the bottom.
   */
  static boxes(value, steps) {
    const total = TrackerMath.clampInt(steps, 1, LIMITS.MAX_STEPS);
    const filled = TrackerMath.clampInt(value, 0, total);
    return Array.from({ length: total }, (_, i) => {
      const index = total - i;
      return { index, filled: index <= filled };
    });
  }

  /**
   * Keep only the newest `max` log entries (the log is ordered oldest first).
   * @template T
   * @param {T[]} log
   * @param {number} [max]
   * @returns {T[]}  A new array.
   */
  static trimLog(log, max = LIMITS.MAX_LOG) {
    return log.length > max ? log.slice(log.length - max) : log.slice();
  }

  /**
   * Grouping key of a tracker's NPC: the CB uuid, or `name:<text>` for a manual NPC, or "" when
   * neither is set. Used by the panel filter.
   * @param {Pick<Tracker, "npcUuid"|"npcName">} tracker
   * @returns {string}
   */
  static npcKey(tracker) {
    if (tracker.npcUuid) return tracker.npcUuid;
    const name = String(tracker.npcName ?? "").trim();
    return name ? `${TrackerMath.NAME_KEY_PREFIX}${name}` : "";
  }

  /**
   * Move an item before or after another one (by `id`). Used for reordering trackers.
   * @template {{id: string}} T
   * @param {T[]} items
   * @param {string} id          Id of the item to move.
   * @param {string} targetId    Id of the item it is dropped on.
   * @param {boolean} after      Insert after the target instead of before it.
   * @returns {T[]|null}         A new array, or null when nothing changes (unknown ids, same item, same place).
   */
  static move(items, id, targetId, after) {
    if (id === targetId) return null;
    const from = items.findIndex(i => i.id === id);
    if (from < 0 || !items.some(i => i.id === targetId)) return null;
    const rest = items.filter((_, i) => i !== from);
    const at = rest.findIndex(i => i.id === targetId) + (after ? 1 : 0);
    if (at === from) return null;
    rest.splice(at, 0, items[from]);
    return rest;
  }

  /**
   * Return a cleaned copy of a tracker: bar count, steps and values within their limits, invalid
   * colors replaced by the default, log trimmed, manual names trimmed and cut to LIMITS.MAX_NAME.
   * Idempotent. Does not touch ids or uuids.
   * @param {Tracker} tracker
   * @returns {Tracker}
   */
  static normalize(tracker) {
    const bars = (tracker.bars ?? []).slice(0, LIMITS.MAX_BARS).map(bar => {
      const steps = TrackerMath.clampInt(bar.steps, 1, LIMITS.MAX_STEPS);
      const color = TrackerMath.isColor(bar.color) ? bar.color : DEFAULT_BAR_COLOR;
      return { ...bar, steps, color, value: TrackerMath.clampInt(bar.value, 0, steps) };
    });
    const clean = value => String(value ?? "").trim().slice(0, LIMITS.MAX_NAME);
    return {
      ...tracker,
      npcName: clean(tracker.npcName),
      pcName: clean(tracker.pcName),
      bars,
      log: TrackerMath.trimLog(tracker.log ?? [])
    };
  }
}
