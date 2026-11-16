/**
 * Tracker templates: built-in definitions and the pure code that turns a template
 * into a new tracker. Custom templates are stored in the world setting; merging
 * them in is done by {@link TrackerStore} so this file stays free of Foundry globals.
 * @module tracker/tracker-templates
 */
import { DEFAULT_TEMPLATE_ID, I18N_PREFIX, LIMITS } from "../constants.mjs";
import { TrackerMath } from "./tracker-math.mjs";

/**
 * @typedef {object} TemplateBar
 * @property {string} label  i18n key or plain text.
 * @property {number} steps
 * @property {string} color
 */

/**
 * @typedef {object} TrackerTemplate
 * @property {string} id
 * @property {string} name   i18n key or plain text.
 * @property {TemplateBar[]} bars
 */

export class TrackerTemplates {
  /** @type {readonly TrackerTemplate[]} */
  static BUILTIN = Object.freeze([
    Object.freeze({
      id: DEFAULT_TEMPLATE_ID,
      name: `${I18N_PREFIX}.Templates.sympathyAntipathy.name`,
      bars: Object.freeze([
        Object.freeze({ label: `${I18N_PREFIX}.Templates.sympathyAntipathy.sympathy`, steps: 5, color: "#4f9d69" }),
        Object.freeze({ label: `${I18N_PREFIX}.Templates.sympathyAntipathy.antipathy`, steps: 5, color: "#c0504d" })
      ])
    }),
    Object.freeze({
      id: "single-bar",
      name: `${I18N_PREFIX}.Templates.singleBar.name`,
      bars: Object.freeze([
        Object.freeze({ label: `${I18N_PREFIX}.Templates.singleBar.bar`, steps: 5, color: "#4a7fb5" })
      ])
    })
  ]);

  /**
   * Find a template by id in a list (built-ins plus custom ones).
   * @param {TrackerTemplate[]} templates
   * @param {string} id
   * @returns {TrackerTemplate|undefined}
   */
  static find(templates, id) {
    return templates.find(t => t.id === id);
  }

  /**
   * Build the source data of a new tracker from a template.
   * @param {TrackerTemplate} template
   * @param {object} options
   * @param {string} [options.npcUuid]  UUID of the NPC page; empty for a manual NPC.
   * @param {string} [options.npcName]  Manual NPC name (used while `npcUuid` is empty).
   * @param {string|null} [options.pcUuid]  UUID of the PC page, or null.
   * @param {string} [options.pcName]  Manual PC name (used while `pcUuid` is empty).
   * @param {string} [options.name]  Tracker name, defaults to the template name.
   * @param {() => string} options.idFactory  Produces unique ids (Foundry: `foundry.utils.randomID`).
   * @param {number} [options.now]  Creation timestamp in ms.
   * @returns {import("./tracker-math.mjs").Tracker}
   */
  static build(template, { npcUuid = "", npcName = "", pcUuid = null, pcName = "", name, idFactory, now = Date.now() }) {
    return TrackerMath.normalize({
      id: idFactory(),
      name: name ?? template.name,
      npcUuid,
      npcName,
      pcUuid,
      pcName,
      active: true,
      bars: template.bars.slice(0, LIMITS.MAX_BARS).map(bar => ({
        id: idFactory(),
        label: bar.label,
        steps: bar.steps,
        value: 0,
        color: bar.color
      })),
      log: [],
      createdAt: now
    });
  }
}
