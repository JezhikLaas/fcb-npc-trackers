import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HistoryHtml } from "../scripts/tracker/history-html.mjs";

const EDITOR = 2;

describe("HistoryHtml.editorFields", () => {
  it("keeps only editor fields that are not deleted, sorted by sortOrder", () => {
    const defs = [
      { name: "notes", label: "Notes", fieldType: EDITOR, sortOrder: 2 },
      { name: "short", label: "Short", fieldType: 0, sortOrder: 0 },
      { name: "old", label: "Old", fieldType: EDITOR, sortOrder: 0, deleted: true },
      { name: "bg", label: "Background", fieldType: EDITOR, sortOrder: 1, deleted: false }
    ];
    assert.deepEqual(HistoryHtml.editorFields(defs, EDITOR), [
      { name: "bg", label: "Background" },
      { name: "notes", label: "Notes" }
    ]);
  });
  it("falls back to the name when the label is empty", () => {
    assert.deepEqual(HistoryHtml.editorFields([{ name: "x", label: "", fieldType: EDITOR }], EDITOR), [{ name: "x", label: "x" }]);
  });
  it("returns nothing for missing or broken definitions", () => {
    assert.deepEqual(HistoryHtml.editorFields(undefined, EDITOR), []);
    assert.deepEqual(HistoryHtml.editorFields({}, EDITOR), []);
    assert.deepEqual(HistoryHtml.editorFields([null, { fieldType: EDITOR }], EDITOR), []);
  });
});

describe("HistoryHtml.escape", () => {
  it("escapes HTML special characters", () => {
    assert.equal(HistoryHtml.escape(`<b a="1">'&'</b>`), "&lt;b a=&quot;1&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
    assert.equal(HistoryHtml.escape(null), "");
  });
});

describe("HistoryHtml.build", () => {
  const texts = { noChanges: "No changes yet.", footer: "Transferred 17.11.2026" };

  it("renders heading, values and entries oldest first as given", () => {
    const html = HistoryHtml.build(
      [
        {
          title: "Arno <Pearl>",
          bars: [
            { label: "Sympathy", value: 3, steps: 5 },
            { label: "Antipathy", value: 0, steps: 5 }
          ],
          entries: [
            { time: "1 Hammer 1492, 08:00", label: "Sympathy", from: 0, to: 3, note: "Compliment" },
            { time: "", label: "Antipathy", from: 1, to: 0, note: "" }
          ]
        }
      ],
      texts
    );
    assert.equal(
      html,
      "<h3>Arno &lt;Pearl&gt;</h3>" +
        "<p><strong>Sympathy:</strong> 3/5 · <strong>Antipathy:</strong> 0/5</p>" +
        "<ul><li><em>1 Hammer 1492, 08:00</em> – Sympathy 0 → 3: Compliment</li><li>Antipathy 1 → 0</li></ul>" +
        "<p><em>Transferred 17.11.2026</em></p>"
    );
  });
  it("shows the no-changes text and omits an empty footer", () => {
    const html = HistoryHtml.build([{ title: "Party", bars: [], entries: [] }], { noChanges: "None", footer: "" });
    assert.equal(html, "<h3>Party</h3><p><em>None</em></p>");
  });
});
