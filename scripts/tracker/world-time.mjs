/**
 * Pure helpers for showing in-world time on log entries. No Foundry globals: the panel
 * passes in `game.time.calendar` and the components from `calendar.timeToComponents`.
 * @module tracker/world-time
 */
import { LOG_TIME_MODES } from "../constants.mjs";

/**
 * @typedef {object} WorldDateParts
 * @property {number} year         Display year (`components.year` + the calendar's `yearZero`).
 * @property {string|null} month   Month name as stored in the calendar (often an i18n key); null if the calendar has no months.
 * @property {number} day          1-based day of the month, or day of the year when there are no months.
 * @property {string} time         Time of day as `HH:MM`.
 */

/**
 * @typedef {object} LogTimeDisplay
 * @property {"world"|"real"} primary     Which time is shown as the main text.
 * @property {"real"|null} secondary      Which time is shown as a second, smaller line.
 * @property {"real"|null} tooltip        Which time is shown as a tooltip.
 */

export class WorldTime {
  /**
   * Split calendar components into the parts we display.
   * @param {{year: number, month: number, dayOfMonth: number, day: number, hour: number, minute: number}} components
   *   Result of `CalendarData#timeToComponents`.
   * @param {{years?: {yearZero?: number}, months?: {values?: {name: string}[]}|null}} calendar
   *   The calendar (only `years.yearZero` and `months.values[].name` are read).
   * @returns {WorldDateParts}
   */
  static parts(components, calendar) {
    const months = calendar?.months?.values ?? [];
    const month = months[components.month]?.name ?? null;
    const pad = n => String(Math.max(0, Math.trunc(n ?? 0))).padStart(2, "0");
    return {
      year: (components.year ?? 0) + (calendar?.years?.yearZero ?? 0),
      month,
      day: (month === null ? components.day : components.dayOfMonth) + 1,
      time: `${pad(components.hour)}:${pad(components.minute)}`
    };
  }

  /**
   * Decide which time a log entry shows where.
   * @param {string} mode             One of {@link LOG_TIME_MODES}.
   * @param {boolean} hasWorldTime    Whether the entry has a stored world time (older entries do not).
   * @returns {LogTimeDisplay}
   */
  static display(mode, hasWorldTime) {
    if (!hasWorldTime || mode === LOG_TIME_MODES.REAL) return { primary: "real", secondary: null, tooltip: null };
    if (mode === LOG_TIME_MODES.WORLD) return { primary: "world", secondary: null, tooltip: "real" };
    return { primary: "world", secondary: "real", tooltip: null };
  }

  /**
   * Current world time as a storable integer, or null when it is not a finite number.
   * @param {unknown} worldTime  Usually `game.time.worldTime`.
   * @returns {number|null}
   */
  static toStored(worldTime) {
    return Number.isFinite(worldTime) ? Math.floor(worldTime) : null;
  }
}
