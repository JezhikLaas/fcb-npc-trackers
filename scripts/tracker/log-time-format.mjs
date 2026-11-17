/**
 * Formatting of log entry times with Foundry's i18n and world calendar. Shared by the panel
 * and the history export; the pure decisions live in {@link WorldTime}.
 * @module tracker/log-time-format
 */
import { I18N_PREFIX } from "../constants.mjs";
import { Logger } from "../logger.mjs";
import { WorldTime } from "./world-time.mjs";

export class LogTimeFormat {
  /**
   * Texts for the time of a log entry according to the LOG_TIME setting.
   * @param {import("./tracker-math.mjs").LogEntry} entry
   * @param {string} mode                    One of LOG_TIME_MODES.
   * @param {Intl.DateTimeFormat} dateFormat Formatter for the real time.
   * @returns {{time: string, timeSecondary: string, timeTooltip: string}}
   */
  static entry(entry, mode, dateFormat) {
    const real = dateFormat.format(entry.at);
    const world = Number.isInteger(entry.worldTime) ? LogTimeFormat.world(entry.worldTime) : null;
    const display = WorldTime.display(mode, world !== null);
    const text = kind => (kind === "world" ? world : kind === "real" ? real : "");
    return { time: text(display.primary), timeSecondary: text(display.secondary), timeTooltip: text(display.tooltip) };
  }

  /**
   * Format an in-world time with the world's calendar (`game.time.calendar`).
   * @param {number} seconds  A stored `worldTime`.
   * @returns {string|null}   The formatted date, or null when the calendar cannot handle it.
   */
  static world(seconds) {
    try {
      const calendar = game.time.calendar;
      const parts = WorldTime.parts(calendar.timeToComponents(seconds), calendar);
      const key = parts.month === null ? "worldDateNoMonth" : "worldDate";
      return game.i18n.format(`${I18N_PREFIX}.Card.${key}`, {
        day: parts.day,
        month: parts.month === null ? "" : game.i18n.localize(parts.month),
        year: parts.year,
        time: parts.time
      });
    } catch (err) {
      Logger.warn("Cannot format world time", seconds, err);
      return null;
    }
  }
}
