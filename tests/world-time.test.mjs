import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LOG_TIME_MODES } from "../scripts/constants.mjs";
import { WorldTime } from "../scripts/tracker/world-time.mjs";

const calendar = {
  years: { yearZero: 1490 },
  months: { values: [{ name: "Hammer" }, { name: "Alturiak" }, { name: "Ches" }] }
};

describe("WorldTime.parts", () => {
  it("uses the month name, 1-based day of month, yearZero and HH:MM", () => {
    const parts = WorldTime.parts({ year: 2, month: 1, dayOfMonth: 4, day: 34, hour: 7, minute: 5 }, calendar);
    assert.deepEqual(parts, { year: 1492, month: "Alturiak", day: 5, time: "07:05" });
  });
  it("falls back to the day of the year when the calendar has no months", () => {
    const parts = WorldTime.parts({ year: 3, month: 0, dayOfMonth: 0, day: 99, hour: 23, minute: 59 }, { months: null });
    assert.deepEqual(parts, { year: 3, month: null, day: 100, time: "23:59" });
  });
  it("treats a missing yearZero as 0", () => {
    assert.equal(WorldTime.parts({ year: 5, month: 0, dayOfMonth: 0, day: 0, hour: 0, minute: 0 }, { months: calendar.months }).year, 5);
  });
});

describe("WorldTime.display", () => {
  it("shows both times by default", () => {
    assert.deepEqual(WorldTime.display(LOG_TIME_MODES.BOTH, true), { primary: "world", secondary: "real", tooltip: null });
  });
  it("puts the real time into the tooltip in world mode", () => {
    assert.deepEqual(WorldTime.display(LOG_TIME_MODES.WORLD, true), { primary: "world", secondary: null, tooltip: "real" });
  });
  it("shows only the real time in real mode or without a stored world time", () => {
    const realOnly = { primary: "real", secondary: null, tooltip: null };
    assert.deepEqual(WorldTime.display(LOG_TIME_MODES.REAL, true), realOnly);
    assert.deepEqual(WorldTime.display(LOG_TIME_MODES.BOTH, false), realOnly);
    assert.deepEqual(WorldTime.display(LOG_TIME_MODES.WORLD, false), realOnly);
  });
});

describe("WorldTime.toStored", () => {
  it("floors finite numbers and rejects everything else", () => {
    assert.equal(WorldTime.toStored(3600.7), 3600);
    assert.equal(WorldTime.toStored(0), 0);
    assert.equal(WorldTime.toStored(undefined), null);
    assert.equal(WorldTime.toStored(NaN), null);
  });
});
