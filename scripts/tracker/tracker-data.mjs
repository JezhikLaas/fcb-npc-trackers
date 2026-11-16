/**
 * DataModels of the world settings. They validate and clean stored values.
 * @module tracker/tracker-data
 */
import { LIMITS } from "../constants.mjs";
import { TrackerMath } from "./tracker-math.mjs";

const { DataModel } = foundry.abstract;
const fields = foundry.data.fields;

/** @returns {string} A fresh unique id. */
const newId = () => foundry.utils.randomID();

/** @returns {foundry.data.fields.SchemaField} Schema of one bar template entry. */
const templateBarField = () =>
  new fields.SchemaField({
    label: new fields.StringField({ required: true, blank: false, initial: "" }),
    steps: new fields.NumberField({ required: true, integer: true, min: 1, max: LIMITS.MAX_STEPS, initial: 5 }),
    color: new fields.StringField({ required: true, blank: false, initial: "#4a7fb5" })
  });

/**
 * One relationship tracker between an NPC and (optionally) a player character.
 */
export class TrackerData extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      id: new fields.StringField({ required: true, blank: false, initial: newId }),
      name: new fields.StringField({ required: true, blank: true, initial: "" }),
      npcUuid: new fields.StringField({ required: true, blank: true, initial: "" }),
      pcUuid: new fields.StringField({ required: true, nullable: true, blank: true, initial: null }),
      active: new fields.BooleanField({ required: true, initial: true }),
      bars: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: true, blank: false, initial: newId }),
          label: new fields.StringField({ required: true, blank: true, initial: "" }),
          steps: new fields.NumberField({ required: true, integer: true, min: 1, max: LIMITS.MAX_STEPS, initial: 5 }),
          value: new fields.NumberField({ required: true, integer: true, min: 0, max: LIMITS.MAX_STEPS, initial: 0 }),
          color: new fields.StringField({ required: true, blank: false, initial: "#4a7fb5" })
        }),
        { required: true, initial: [] }
      ),
      log: new fields.ArrayField(
        new fields.SchemaField({
          id: new fields.StringField({ required: true, blank: false, initial: newId }),
          barId: new fields.StringField({ required: true, blank: true, initial: "" }),
          label: new fields.StringField({ required: true, blank: true, initial: "" }),
          from: new fields.NumberField({ required: true, integer: true, min: 0, max: LIMITS.MAX_STEPS, initial: 0 }),
          to: new fields.NumberField({ required: true, integer: true, min: 0, max: LIMITS.MAX_STEPS, initial: 0 }),
          note: new fields.StringField({ required: true, blank: true, initial: "" }),
          at: new fields.NumberField({ required: true, integer: true, min: 0, initial: () => Date.now() })
        }),
        { required: true, initial: [] }
      ),
      createdAt: new fields.NumberField({ required: true, integer: true, min: 0, initial: () => Date.now() })
    };
  }

  /**
   * Bring values back within their limits (value ≤ steps, bar count, log length).
   * @override
   */
  static cleanData(source = {}, options = {}) {
    const cleaned = super.cleanData(source, options);
    return TrackerMath.normalize(cleaned);
  }
}

/**
 * Value of the `trackers` world setting: all trackers of the world.
 */
export class TrackerCollection extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      trackers: new fields.ArrayField(new fields.EmbeddedDataField(TrackerData), { required: true, initial: [] })
    };
  }
}

/**
 * A custom tracker template (value of the `templates` world setting holds a list of these).
 */
export class TemplateData extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      id: new fields.StringField({ required: true, blank: false, initial: newId }),
      name: new fields.StringField({ required: true, blank: false, initial: "Template" }),
      bars: new fields.ArrayField(templateBarField(), { required: true, initial: [] })
    };
  }

  /** @override */
  static validateJoint(data) {
    if (data.bars.length < 1 || data.bars.length > LIMITS.MAX_BARS) {
      throw new Error(`A template needs 1 to ${LIMITS.MAX_BARS} bars.`);
    }
  }
}

/**
 * Value of the `templates` world setting: all custom templates of the world.
 */
export class TemplateCollection extends DataModel {
  /** @override */
  static defineSchema() {
    return {
      templates: new fields.ArrayField(new fields.EmbeddedDataField(TemplateData), { required: true, initial: [] })
    };
  }
}
