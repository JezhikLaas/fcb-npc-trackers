import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BAR_COLOR, LIMITS } from "../scripts/constants.mjs";
import { TrackerMath } from "../scripts/tracker/tracker-math.mjs";
import { TrackerTemplates } from "../scripts/tracker/tracker-templates.mjs";

describe("TrackerMath.clampInt", () => {
  it("clamps and rounds", () => {
    assert.equal(TrackerMath.clampInt(7, 0, 5), 5);
    assert.equal(TrackerMath.clampInt(-2, 0, 5), 0);
    assert.equal(TrackerMath.clampInt(2.6, 0, 5), 3);
  });
  it("falls back to min for non-finite input", () => {
    assert.equal(TrackerMath.clampInt(NaN, 1, 5), 1);
    assert.equal(TrackerMath.clampInt(undefined, 1, 5), 1);
    assert.equal(TrackerMath.clampInt("abc", 0, 5), 0);
  });
});

describe("TrackerMath.applyClick", () => {
  it("fills up to the clicked box", () => {
    assert.equal(TrackerMath.applyClick(0, 3, 5), 3);
    assert.equal(TrackerMath.applyClick(2, 5, 5), 5);
  });
  it("lowers the value when a lower box is clicked", () => {
    assert.equal(TrackerMath.applyClick(4, 2, 5), 2);
  });
  it("takes one step back when the topmost filled box is clicked", () => {
    assert.equal(TrackerMath.applyClick(3, 3, 5), 2);
    assert.equal(TrackerMath.applyClick(1, 1, 5), 0);
  });
  it("handles bars with a single step", () => {
    assert.equal(TrackerMath.applyClick(0, 1, 1), 1);
    assert.equal(TrackerMath.applyClick(1, 1, 1), 0);
  });
  it("clamps out-of-range clicks and values", () => {
    assert.equal(TrackerMath.applyClick(0, 99, 5), 5);
    assert.equal(TrackerMath.applyClick(0, 0, 5), 1);
    assert.equal(TrackerMath.applyClick(99, 5, 5), 4);
  });
  it("respects the maximum step count", () => {
    assert.equal(TrackerMath.applyClick(0, 99, 99), LIMITS.MAX_STEPS);
  });
});

describe("TrackerMath.step", () => {
  it("adds and subtracts within bounds", () => {
    assert.equal(TrackerMath.step(2, 1, 5), 3);
    assert.equal(TrackerMath.step(2, -1, 5), 1);
  });
  it("does not leave 0..steps", () => {
    assert.equal(TrackerMath.step(5, 1, 5), 5);
    assert.equal(TrackerMath.step(0, -1, 5), 0);
  });
});

describe("TrackerMath.boxes", () => {
  it("lists the topmost box first and fills from the bottom", () => {
    assert.deepEqual(TrackerMath.boxes(2, 4), [
      { index: 4, filled: false },
      { index: 3, filled: false },
      { index: 2, filled: true },
      { index: 1, filled: true }
    ]);
  });
  it("handles empty and full bars", () => {
    assert.ok(TrackerMath.boxes(0, 3).every(b => !b.filled));
    assert.ok(TrackerMath.boxes(3, 3).every(b => b.filled));
  });
  it("clamps value and step count", () => {
    assert.equal(TrackerMath.boxes(99, 3).filter(b => b.filled).length, 3);
    assert.equal(TrackerMath.boxes(0, 99).length, LIMITS.MAX_STEPS);
  });
});

describe("TrackerMath.isColor", () => {
  it("accepts #rrggbb only", () => {
    assert.equal(TrackerMath.isColor("#4f9d69"), true);
    assert.equal(TrackerMath.isColor("#ABCDEF"), true);
    for (const bad of ["red", "#fff", "#12345g", "url(x)", "", null, undefined, 5]) {
      assert.equal(TrackerMath.isColor(bad), false);
    }
  });
});

describe("TrackerMath.trimLog", () => {
  it("keeps the newest entries without mutating", () => {
    const log = [1, 2, 3, 4, 5];
    assert.deepEqual(TrackerMath.trimLog(log, 3), [3, 4, 5]);
    assert.equal(log.length, 5);
  });
  it("returns a copy when nothing is trimmed", () => {
    const log = [1, 2];
    const result = TrackerMath.trimLog(log, 3);
    assert.deepEqual(result, [1, 2]);
    assert.notEqual(result, log);
  });
});

describe("TrackerMath.normalize", () => {
  const base = { id: "t", name: "n", npcUuid: "a", pcUuid: null, active: true, createdAt: 0 };

  it("clamps steps and values and limits the bar count", () => {
    const bars = Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, label: "x", steps: 50, value: 99, color: "#fff" }));
    const result = TrackerMath.normalize({ ...base, bars, log: [] });
    assert.equal(result.bars.length, LIMITS.MAX_BARS);
    assert.ok(result.bars.every(b => b.steps === LIMITS.MAX_STEPS && b.value === LIMITS.MAX_STEPS));
  });
  it("pulls the value down when steps were reduced", () => {
    const bars = [{ id: "b", label: "x", steps: 3, value: 5, color: "#fff" }];
    assert.equal(TrackerMath.normalize({ ...base, bars, log: [] }).bars[0].value, 3);
  });
  it("trims the log to the maximum", () => {
    const log = Array.from({ length: LIMITS.MAX_LOG + 5 }, (_, i) => ({ id: `l${i}` }));
    const result = TrackerMath.normalize({ ...base, bars: [], log });
    assert.equal(result.log.length, LIMITS.MAX_LOG);
    assert.equal(result.log.at(-1).id, `l${LIMITS.MAX_LOG + 4}`);
  });
  it("is idempotent and does not mutate its input", () => {
    const input = { ...base, bars: [{ id: "b", label: "x", steps: 20, value: 30, color: "#fff" }], log: [] };
    const once = TrackerMath.normalize(input);
    assert.deepEqual(TrackerMath.normalize(once), once);
    assert.equal(input.bars[0].steps, 20);
  });
  it("replaces invalid colors by the default", () => {
    const bars = [
      { id: "a", label: "x", steps: 3, value: 1, color: "red; background:url(x)" },
      { id: "b", label: "x", steps: 3, value: 1, color: "#112233" }
    ];
    const result = TrackerMath.normalize({ ...base, bars, log: [] });
    assert.equal(result.bars[0].color, DEFAULT_BAR_COLOR);
    assert.equal(result.bars[1].color, "#112233");
  });
  it("tolerates missing bars and log", () => {
    const result = TrackerMath.normalize({ ...base });
    assert.deepEqual(result.bars, []);
    assert.deepEqual(result.log, []);
  });
});

describe("TrackerMath.npcKey", () => {
  it("prefers the CB uuid", () => {
    assert.equal(TrackerMath.npcKey({ npcUuid: "u1", npcName: "Ignored" }), "u1");
  });
  it("uses the prefixed manual name when there is no uuid", () => {
    assert.equal(TrackerMath.npcKey({ npcUuid: "", npcName: "  Gulfport Behörden " }), "name:Gulfport Behörden");
  });
  it("is empty without uuid and name", () => {
    assert.equal(TrackerMath.npcKey({ npcUuid: "", npcName: "  " }), "");
    assert.equal(TrackerMath.npcKey({ npcUuid: "" }), "");
  });
});

describe("TrackerMath.normalize (manual names)", () => {
  it("trims manual names and cuts them to the maximum length", () => {
    const result = TrackerMath.normalize({
      npcName: "  Heldengruppe ",
      pcName: "x".repeat(LIMITS.MAX_NAME + 20),
      bars: [],
      log: []
    });
    assert.equal(result.npcName, "Heldengruppe");
    assert.equal(result.pcName.length, LIMITS.MAX_NAME);
  });
  it("turns missing names (old trackers) into empty strings", () => {
    const result = TrackerMath.normalize({ bars: [], log: [] });
    assert.equal(result.npcName, "");
    assert.equal(result.pcName, "");
  });
});

describe("TrackerTemplates.build", () => {
  let counter = 0;
  const idFactory = () => `id${++counter}`;

  it("builds the default sympathy/antipathy tracker with two 5-step bars at 0", () => {
    const template = TrackerTemplates.find(TrackerTemplates.BUILTIN, "sympathy-antipathy");
    const tracker = TrackerTemplates.build(template, { npcUuid: "npc", pcUuid: "pc", idFactory, now: 42 });
    assert.equal(tracker.npcUuid, "npc");
    assert.equal(tracker.pcUuid, "pc");
    assert.equal(tracker.active, true);
    assert.equal(tracker.createdAt, 42);
    assert.deepEqual(tracker.bars.map(b => [b.steps, b.value]), [[5, 0], [5, 0]]);
    assert.deepEqual(tracker.log, []);
  });
  it("gives the tracker and every bar a unique id", () => {
    const template = TrackerTemplates.BUILTIN[0];
    const tracker = TrackerTemplates.build(template, { npcUuid: "npc", idFactory });
    const ids = [tracker.id, ...tracker.bars.map(b => b.id)];
    assert.equal(new Set(ids).size, ids.length);
  });
  it("defaults to no PC and the template name, and accepts overrides", () => {
    const template = TrackerTemplates.BUILTIN[0];
    const tracker = TrackerTemplates.build(template, { npcUuid: "npc", idFactory });
    assert.equal(tracker.pcUuid, null);
    assert.equal(tracker.name, template.name);
    assert.equal(TrackerTemplates.build(template, { npcUuid: "npc", name: "Custom", idFactory }).name, "Custom");
  });
  it("stores manual names and defaults them to empty", () => {
    const template = TrackerTemplates.BUILTIN[0];
    const manual = TrackerTemplates.build(template, { npcName: "Gulfport Behörden", pcName: "Heldengruppe", idFactory });
    assert.equal(manual.npcUuid, "");
    assert.equal(manual.npcName, "Gulfport Behörden");
    assert.equal(manual.pcName, "Heldengruppe");
    const plain = TrackerTemplates.build(template, { npcUuid: "npc", idFactory });
    assert.equal(plain.npcName, "");
    assert.equal(plain.pcName, "");
  });
  it("does not mutate the built-in template", () => {
    const template = TrackerTemplates.BUILTIN[0];
    const tracker = TrackerTemplates.build(template, { npcUuid: "npc", idFactory });
    tracker.bars[0].value = 3;
    assert.equal(template.bars[0].value, undefined);
  });
});

describe("TrackerTemplates.find", () => {
  it("returns undefined for unknown ids", () => {
    assert.equal(TrackerTemplates.find(TrackerTemplates.BUILTIN, "nope"), undefined);
  });
});
