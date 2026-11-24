/**
 * GM dialog for creating a tracker or editing its name, PC and bars.
 * @module apps/tracker-form
 */
import { DEFAULT_BAR_COLOR, DEFAULT_TEMPLATE_ID, I18N_PREFIX, LIMITS, MODULE_ID, TEMPLATES } from "../constants.mjs";
import { Logger } from "../logger.mjs";
import { CampaignBuilderBridge } from "../integration/campaign-builder-bridge.mjs";
import { ModuleSettings } from "../settings.mjs";
import { TrackerMath } from "../tracker/tracker-math.mjs";
import { TrackerStore } from "../tracker/tracker-store.mjs";
import { TrackerTemplates } from "../tracker/tracker-templates.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {object} DraftBar
 * @property {string} id      Empty for bars that do not exist yet.
 * @property {string} label
 * @property {number} steps
 * @property {string} color
 */

/**
 * @typedef {object} Draft
 * @property {string} name
 * @property {string} npcUuid   CB entry, or "" for a manual NPC.
 * @property {string} npcName   Manual name, used while `npcUuid` is empty.
 * @property {string} pcUuid    CB entry, or "" for none/manual.
 * @property {string} pcName    Manual name, used while `pcUuid` is empty.
 * @property {string} templateId
 * @property {DraftBar[]} bars
 */

export class TrackerForm extends HandlebarsApplicationMixin(ApplicationV2) {
  /** The one open form, if any. @type {TrackerForm|null} */
  static #instance = null;

  /** Id of the tracker being edited, or null when creating. @type {string|null} */
  #trackerId;

  /** Whether the remembered NPC/PC choices were applied (done once, when the lists are first available). */
  #restored = false;

  /**
   * Working copy of the form. Kept in sync on every change, persisted by submit only.
   * @type {Draft}
   */
  #draft;

  /**
   * @param {object} [data]
   * @param {string|null} [data.trackerId]  Edit this tracker instead of creating one.
   * @param {string} [data.npcUuid]         Preselected NPC (create only): a CB uuid or a `name:<text>` filter key.
   * @param {string} [data.pcUuid]          Preselected PC (create only): a CB uuid or a `name:<text>` filter key.
   * @param {object} [options]              ApplicationV2 options.
   */
  constructor({ trackerId = null, npcUuid, pcUuid } = {}, options = {}) {
    super(options);
    this.#trackerId = trackerId;
    this.#draft = trackerId ? TrackerForm.#draftFromTracker(trackerId) : TrackerForm.#draftForCreate(npcUuid, pcUuid);
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-form`,
    tag: "form",
    classes: ["fcb-npc-trackers", "fcb-npc-trackers-form"],
    window: {
      icon: "fa-solid fa-people-arrows",
      contentClasses: ["standard-form"]
    },
    position: { width: 620, height: "auto" },
    form: {
      handler: TrackerForm.#onForm,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addBar: TrackerForm.#onAddBar,
      removeBar: TrackerForm.#onRemoveBar,
      refresh: TrackerForm.#onRefresh,
      cancel: TrackerForm.#onCancel
    }
  };


  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.FORM }
  };

  /**
   * Open the form (closing a previous one).
   * @param {{trackerId?: string|null, npcUuid?: string, pcUuid?: string}} [data]
   * @returns {Promise<TrackerForm>}
   */
  static async open(data = {}) {
    await TrackerForm.#instance?.close();
    const form = new TrackerForm(data);
    TrackerForm.#instance = form;
    await form.render({ force: true });
    return form;
  }

  /** @override */
  get title() {
    return game.i18n.localize(`${I18N_PREFIX}.Form.${this.#trackerId ? "titleEdit" : "titleCreate"}`);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isEdit = Boolean(this.#trackerId);
    const d = this.#draft;
    const [npcs, pcs] = await Promise.all([CampaignBuilderBridge.npcs(), CampaignBuilderBridge.pcs()]);
    const npcChoices = TrackerForm.#choices(npcs);
    const pcChoices = TrackerForm.#choices(pcs);
    // Keep a PC that is no longer listed selectable, so editing does not silently drop it.
    if (d.pcUuid && !pcChoices.some(c => c.value === d.pcUuid)) {
      const entry = await CampaignBuilderBridge.resolve(d.pcUuid);
      pcChoices.unshift({ value: d.pcUuid, label: entry?.name ?? d.pcUuid });
    }
    if (!isEdit && !this.#restored && npcChoices.length) {
      this.#restoreLast(npcChoices, pcChoices);
      this.#restored = true;
    }
    const empty = !isEdit && npcChoices.length === 0;
    let npcLabel = "";
    if (isEdit && d.npcUuid) {
      const entry = await CampaignBuilderBridge.resolve(d.npcUuid);
      npcLabel = entry ? TrackerForm.#label(entry.name, CampaignBuilderBridge.isOrganization(entry)) : "";
    }

    return Object.assign(context, {
      isEdit,
      npcLabel,
      npcFixed: isEdit && Boolean(d.npcUuid),
      npcName: d.npcName,
      pcName: d.pcName,
      npcChoices,
      pcChoices,
      templateChoices: TrackerStore.templates.map(t => ({ value: t.id, label: game.i18n.localize(t.name) })),
      npcUuid: d.npcUuid,
      pcUuid: d.pcUuid,
      templateId: d.templateId,
      name: d.name,
      customNpcLabel: game.i18n.localize(`${I18N_PREFIX}.Form.customName`),
      noPcLabel: game.i18n.localize(`${I18N_PREFIX}.Form.noPc`),
      bars: d.bars.map((bar, index) => ({ ...bar, index })),
      maxSteps: LIMITS.MAX_STEPS,
      maxName: LIMITS.MAX_NAME,
      maxBars: LIMITS.MAX_BARS,
      cannotAdd: d.bars.length >= LIMITS.MAX_BARS,
      cannotRemove: d.bars.length <= 1,
      noEntries: empty
    });
  }

  /**
   * Select options for entries, sorted by name. Organizations are marked as such; when entries of
   * several Campaign Builder settings are listed, each label also carries its setting name.
   * @param {import("../integration/campaign-builder-bridge.mjs").EntryRef[]} entries
   * @returns {{value: string, label: string}[]}
   */
  static #choices(entries) {
    const severalSettings = new Set(entries.map(e => e.setting)).size > 1;
    return entries
      .map(e => ({ value: e.uuid, label: TrackerForm.#label(e.name, e.organization, severalSettings ? e.setting : "") }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /**
   * Display label of an entry: its name, followed by "(Organization, setting)" as far as applicable.
   * @param {string} name
   * @param {boolean} organization
   * @param {string} [setting]
   * @returns {string}
   */
  static #label(name, organization, setting = "") {
    const tags = [organization ? game.i18n.localize(`${I18N_PREFIX}.Form.organization`) : "", setting].filter(Boolean);
    return tags.length ? `${name} (${tags.join(", ")})` : name;
  }

  /**
   * Apply the remembered NPC/PC (once). Choices already made in the form are kept.
   * @param {{value: string}[]} npcChoices
   * @param {{value: string}[]} pcChoices
   */
  #restoreLast(npcChoices, pcChoices) {
    const last = ModuleSettings.lastCreate;
    const d = this.#draft;
    if (!d.npcUuid && !d.npcName && npcChoices.some(c => c.value === last.npcUuid)) d.npcUuid = last.npcUuid;
    if (!d.pcUuid && !d.pcName && pcChoices.some(c => c.value === last.pcUuid)) d.pcUuid = last.pcUuid;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll("input[data-filter]")) {
      input.addEventListener("input", () => this.#applyFilter(input));
    }
  }

  /**
   * Hide the options of a select that do not match the text of its filter input.
   * The selected option and the blank option always stay visible.
   * @param {HTMLInputElement} input
   */
  #applyFilter(input) {
    const select = this.element.querySelector(`select[name="${input.dataset.filter}"]`);
    if (!select) return;
    const query = input.value.trim().toLocaleLowerCase();
    for (const option of select.options) {
      option.hidden = Boolean(option.value) && !option.selected && !option.text.toLocaleLowerCase().includes(query);
    }
  }

  /**
   * Keep the draft in sync with the form; save on submit (Save button or Enter).
   * @this {TrackerForm}
   * @param {SubmitEvent|Event} event
   * @param {HTMLFormElement} _form
   * @param {foundry.applications.ux.FormDataExtended} formData
   */
  static async #onForm(event, _form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const draft = this.#draft;
    const previousTemplate = draft.templateId;
    const previousIdentity = `${draft.npcUuid}|${draft.pcUuid}`;

    draft.name = data.name ?? "";
    draft.pcUuid = data.pcUuid ?? "";
    // Name inputs are disabled (and absent from the form data) while a CB entry is selected.
    if (data.pcName !== undefined) draft.pcName = data.pcName;
    if (!this.#trackerId) {
      draft.npcUuid = data.npcUuid ?? "";
      draft.templateId = data.templateId ?? draft.templateId;
    }
    if (data.npcName !== undefined) draft.npcName = data.npcName;
    draft.bars = Object.entries(data.bars ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, bar]) => ({
        id: bar.id ?? "",
        label: bar.label ?? "",
        steps: TrackerMath.clampInt(bar.steps, 1, LIMITS.MAX_STEPS),
        color: TrackerMath.isColor(bar.color) ? bar.color : DEFAULT_BAR_COLOR
      }));

    const templateChanged = !this.#trackerId && draft.templateId !== previousTemplate;
    if (templateChanged) draft.bars = TrackerForm.#barsFromTemplateId(draft.templateId);
    // Switching a selection between "CB entry" and "own name" enables/disables the name input.
    if (templateChanged || previousIdentity !== `${draft.npcUuid}|${draft.pcUuid}`) {
      await this.render();
      return;
    }
    if (event.type === "submit") await this.#save();
  }

  /** @this {TrackerForm} */
  static #onAddBar() {
    if (this.#draft.bars.length >= LIMITS.MAX_BARS) return;
    this.#draft.bars.push({
      id: "",
      label: game.i18n.localize(`${I18N_PREFIX}.Form.newBar`),
      steps: 5,
      color: DEFAULT_BAR_COLOR
    });
    this.render();
  }

  /**
   * @this {TrackerForm}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target  Button carrying `data-index`.
   */
  static #onRemoveBar(_event, target) {
    if (this.#draft.bars.length <= 1) return;
    this.#draft.bars.splice(Number(target.dataset.index), 1);
    this.render();
  }

  /** @this {TrackerForm} */
  static #onRefresh() {
    this.render();
  }

  /** @this {TrackerForm} */
  static #onCancel() {
    this.close();
  }

  /** @override */
  _onClose(options) {
    if (TrackerForm.#instance === this) TrackerForm.#instance = null;
    super._onClose(options);
  }

  /** Validate the draft, write it and close. */
  async #save() {
    const d = this.#draft;
    const warn = key => ui.notifications.warn(`${I18N_PREFIX}.Form.${key}`, { localize: true });
    const bars = d.bars.map(bar => ({ ...bar, label: bar.label.trim() }));
    const npcName = d.npcName.trim();
    if (!d.npcUuid && !npcName) return warn("needNpc");
    if (!bars.length || bars.some(bar => !bar.label)) return warn("needBarLabel");

    try {
      if (this.#trackerId) {
        await TrackerStore.updateTracker(this.#trackerId, {
          name: d.name,
          npcName,
          pcUuid: d.pcUuid || null,
          pcName: d.pcName,
          bars
        });
      } else {
        await TrackerStore.create({
          npcUuid: d.npcUuid,
          npcName,
          pcUuid: d.pcUuid || null,
          pcName: d.pcName,
          name: d.name,
          bars
        });
        await ModuleSettings.setLastCreate({ npcUuid: d.npcUuid, pcUuid: d.pcUuid, templateId: d.templateId });
      }
    } catch (err) {
      Logger.error("Saving tracker failed.", err);
      ui.notifications.error(err.message, { console: false });
      return;
    }
    await this.close();
  }

  /**
   * Draft for a new tracker. The remembered NPC/PC are applied later (`#restoreLast`), once the lists are known.
   * @param {string} [npcUuid]  Preselected NPC (uuid or `name:<text>` key).
   * @param {string} [pcUuid]   Preselected PC (uuid or `name:<text>` key).
   * @returns {Draft}
   */
  static #draftForCreate(npcUuid, pcUuid) {
    const prefix = TrackerMath.NAME_KEY_PREFIX;
    const manual = npcUuid?.startsWith(prefix) ? npcUuid.slice(prefix.length) : "";
    const manualPc = pcUuid?.startsWith(prefix) ? pcUuid.slice(prefix.length) : "";
    const last = ModuleSettings.lastCreate;
    const templateId = TrackerTemplates.find(TrackerStore.templates, last.templateId) ? last.templateId : DEFAULT_TEMPLATE_ID;
    return {
      name: "",
      npcUuid: manual ? "" : npcUuid || "",
      npcName: manual,
      pcUuid: manualPc ? "" : pcUuid || "",
      pcName: manualPc,
      templateId,
      bars: TrackerForm.#barsFromTemplateId(templateId)
    };
  }

  /**
   * @param {string} trackerId
   * @returns {Draft}
   */
  static #draftFromTracker(trackerId) {
    const tracker = TrackerStore.get(trackerId);
    if (!tracker) throw new Error(`Unknown tracker "${trackerId}".`);
    return {
      name: game.i18n.localize(tracker.name),
      npcUuid: tracker.npcUuid,
      npcName: tracker.npcName ?? "",
      pcUuid: tracker.pcUuid ?? "",
      pcName: tracker.pcName ?? "",
      templateId: "",
      bars: tracker.bars.map(bar => ({
        id: bar.id,
        label: game.i18n.localize(bar.label),
        steps: bar.steps,
        color: bar.color
      }))
    };
  }

  /**
   * Bars of a template with translated labels, so the GM edits real text.
   * @param {string} templateId
   * @returns {DraftBar[]}
   */
  static #barsFromTemplateId(templateId) {
    const template = TrackerTemplates.find(TrackerStore.templates, templateId) ?? TrackerTemplates.BUILTIN[0];
    return template.bars.map(bar => ({
      id: "",
      label: game.i18n.localize(bar.label),
      steps: bar.steps,
      color: bar.color
    }));
  }
}
