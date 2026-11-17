/**
 * Pure helpers for exporting the tracker history into a Campaign Builder editor field:
 * picking the usable field definitions and building the HTML. No Foundry globals; all texts
 * arrive already localized.
 * @module tracker/history-html
 */

/**
 * @typedef {object} FieldChoice
 * @property {string} name   Key of the field in the entry's `system.customFields`.
 * @property {string} label  Label shown in the Campaign Builder.
 */

/**
 * @typedef {object} HistoryEntry
 * @property {string} time   Formatted time of the change.
 * @property {string} label  Bar label (snapshot from the log).
 * @property {number} from
 * @property {number} to
 * @property {string} note
 */

/**
 * @typedef {object} HistorySection
 * @property {string} title                                         Heading, usually the PC name.
 * @property {{label: string, value: number, steps: number}[]} bars Current values.
 * @property {HistoryEntry[]} entries                               Log entries in the order to render.
 */

/**
 * @typedef {object} HistoryTexts
 * @property {string} noChanges  Shown for a section without log entries.
 * @property {string} footer     Last line, e.g. "Transferred on …"; omitted when empty.
 */

export class HistoryHtml {
  /**
   * Editor fields that are not deleted, in the Campaign Builder's order.
   * @param {unknown} definitions  Field definitions of one content type (an array of
   *   `{name, label, fieldType, sortOrder, deleted}`), as stored by the Campaign Builder.
   * @param {number} editorType    Value of `FieldType.Editor`.
   * @returns {FieldChoice[]}
   */
  static editorFields(definitions, editorType) {
    if (!Array.isArray(definitions)) return [];
    return definitions
      .filter(d => d && typeof d.name === "string" && d.name && d.fieldType === editorType && !d.deleted)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(d => ({ name: d.name, label: typeof d.label === "string" && d.label ? d.label : d.name }));
  }

  /**
   * Log entries in the export order. The stored log is oldest first; any value other than
   * `"newestFirst"` keeps that order.
   * @template T
   * @param {T[]} entries  Log entries, oldest first.
   * @param {string} order One of EXPORT_ORDERS (`"oldestFirst"`, `"newestFirst"`).
   * @returns {T[]} A new array.
   */
  static order(entries, order) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    return order === "newestFirst" ? list.reverse() : list;
  }

  /**
   * Escape text for use in HTML content and attributes.
   * @param {unknown} text
   * @returns {string}
   */
  static escape(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  /**
   * Build the HTML for the field: one heading per tracker, the current values and the changes.
   * @param {HistorySection[]} sections
   * @param {HistoryTexts} texts
   * @returns {string}
   */
  static build(sections, { noChanges, footer }) {
    const e = HistoryHtml.escape;
    const parts = sections.map(section => {
      const values = section.bars.map(b => `<strong>${e(b.label)}:</strong> ${b.value}/${b.steps}`).join(" · ");
      const list = section.entries.length
        ? `<ul>${section.entries.map(entry => HistoryHtml.#entry(entry)).join("")}</ul>`
        : `<p><em>${e(noChanges)}</em></p>`;
      return `<h3>${e(section.title)}</h3>${values ? `<p>${values}</p>` : ""}${list}`;
    });
    if (footer) parts.push(`<p><em>${e(footer)}</em></p>`);
    return parts.join("");
  }

  /**
   * @param {HistoryEntry} entry
   * @returns {string}
   */
  static #entry({ time, label, from, to, note }) {
    const e = HistoryHtml.escape;
    const head = time ? `<em>${e(time)}</em> – ` : "";
    const tail = note ? `: ${e(note)}` : "";
    return `<li>${head}${e(label)} ${from} → ${to}${tail}</li>`;
  }
}
