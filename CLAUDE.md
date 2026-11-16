# CLAUDE.md – fcb-npc-trackers

Notes for Claude (and every other human or AI contributor) working on this module.

## What this module does

Foundry VTT module for the **World & Campaign Builder** (`campaign-builder`, "CB").
It lets the GM define **relationship trackers** between an NPC and a player character
on the fly, e.g. *Aurelia von Halm ↔ Arno Pearl* with the bars **Sympathy** and
**Antipathy**, 5 steps each. Bars stand side by side, fill from bottom to top, and a
log with optional notes per change sits to the right.

Requirements (agreed with the maintainer):

- Any number of bars per tracker, each with its own step count.
- Click a box to set the value; click the topmost filled box to take one step back.
- Every change creates a log entry; the note is optional and can be added afterwards.
- Remove a tracker with one click (no confirmation, short undo).
- Trackers persist until removed, so they can be prepared before a session.
- Scope: one tracker per NPC × PC pair. GM only.
- UI: a session panel with all active trackers (filterable per NPC).

## Core architecture decisions

- **Own windows, not a CB tab.** The CB renders one Vue app into one window and has
  no extension point. We never import from, patch or inject into the CB (phase 1).
  If something is not reachable via `module.api`, hooks or documents, propose an
  upstream change instead.
- **Data lives in world settings**, not in flags: CB entries are `JournalEntryPage`s of
  subtype `entry2` inside **compendium packs** (one per CB setting), so there is no
  cheap way to enumerate or write flags on them.
  - `trackers`: `TrackerCollection` (DataModel) with all trackers.
  - `templates`: `TemplateCollection` (DataModel) with custom templates; built-ins are code.
  - Trackers reference NPC/PC pages by UUID. A deleted CB entry leaves an *orphan*
    that is only reported (`TrackerStore.findOrphans`), never removed automatically.
- **All writes go through `TrackerStore`**: GM-only, serialized (read-modify-write
  chain), normalized with `TrackerMath.normalize` before saving.
- **Pure logic is separate** (`tracker-math.mjs`, `tracker-templates.mjs`) and has no
  Foundry globals, so it is unit tested with `npm test`.

### Do not

- Do not import anything from the CB or touch its DOM/Pinia stores. CB knowledge lives
  only in `scripts/integration/campaign-builder-bridge.mjs`.
- Do not write flags on CB documents.
- Do not use jQuery, `Application` (v1), `FormApplication` or `Dialog` (v1).
- Do not delete trackers automatically (orphans are reported, the GM decides).

## Target platform

- Foundry VTT **v14** (`compatibility.minimum` 14, verified 14.370).
- Campaign Builder ≥ 1.10.1 (first release flagged v14-compatible); `requires` in `module.json`.

## Coding conventions

(Same as `daggerheart-currency`.)

- Vanilla JavaScript, native ES modules (`.mjs`), no build step, no dependencies.
- Classes for everything with state or behaviour; private `#fields` / `#methods`
  where things are internal; `static` for stateless helpers.
- UI only with **ApplicationV2** + `HandlebarsApplicationMixin`
  (`foundry.applications.api`), `DialogV2` for prompts. Use `static DEFAULT_OPTIONS`,
  `static PARTS`, `actions` for click handlers, `form.handler` for forms.
- Settings with structured data use a `foundry.abstract.DataModel` as `type`
  so values are validated and cleaned.
- Namespaced Foundry API only (`foundry.applications.handlebars.*`,
  `foundry.utils.*` …), never the deprecated globals.
- One responsibility per file; filenames `kebab-case.mjs`, classes `PascalCase`.
- All user-facing strings via i18n (`lang/en.json`, `lang/de.json`), keys under
  `FCB_NPC_TRACKERS.*`. Keep both files in sync.
- CSS classes prefixed `fcb-npc-trackers`; settings registered under the module id;
  constants live in `scripts/constants.mjs`.
- JSDoc on every public class/method, including `@param`/`@returns` types.
- Code, comments and commit messages in **English**; discussion with the
  maintainer in German.
- Public API for macros and other modules: `game.modules.get("fcb-npc-trackers").api`.
  No other globals.
- Bar values are integers within `0..steps`. Never store fractions.

## Layout

```
module.json                     manifest (requires campaign-builder)
package.json                    dev tooling only (npm test), never shipped logic
scripts/
  main.mjs                      entry point: hook registration + public API, no logic
  constants.mjs                 module id, setting keys, hooks, limits, upstream ids (pure data)
  logger.mjs                    prefixed console logging
  settings.mjs                  ModuleSettings: registration + typed getters/setters
  tracker/
    tracker-math.mjs            TrackerMath: pure click/clamp/normalize logic (no Foundry globals)
    tracker-templates.mjs       TrackerTemplates: built-in templates + pure tracker builder
    tracker-data.mjs            DataModels: TrackerData, TrackerCollection, TemplateData, TemplateCollection
    tracker-store.mjs           TrackerStore: all reads/writes, undo buffer, orphan check
  integration/
    campaign-builder-bridge.mjs CampaignBuilderBridge: the ONLY place with CB knowledge
  entry-points.mjs              EntryPoints: keybinding + scene control button (GM only)
  apps/
    tracker-panel.mjs           TrackerPanel: session panel (cards, log, notes, undo notice)
    tracker-form.mjs            TrackerForm: create / edit dialog (bars editable)
lang/                           en.json, de.json
styles/                         npc-trackers.css
templates/                      tracker-panel.hbs, tracker-card.hbs (partial), tracker-form.hbs
tests/                          node:test unit tests for pure logic
```

### Data conventions

- Limits are in `LIMITS` (`constants.mjs`): 6 bars, 12 steps, 200 log entries per tracker
  (oldest dropped first).
- Bar `label`, template `name` may hold **i18n keys** (built-ins do) or plain text. Always
  pass them through `game.i18n.localize` when displaying; `localize` returns plain text
  unchanged.
- Log entries keep a **snapshot of the bar label**, so history stays readable after a bar
  is renamed or removed.
- `value`/`steps` consistency (`value ≤ steps`) is enforced by `TrackerMath.normalize`,
  called in `TrackerData.cleanData` and before every save.
- Custom hooks: `fcb-npc-trackers.trackerChanged` `(tracker, logEntry)`,
  `fcb-npc-trackers.trackerRemoved` `(tracker)`, `fcb-npc-trackers.trackersUpdated`
  (no args, every client, fired from the settings' `onChange`; UI re-renders on it).

## Upstream reference points (World & Campaign Builder)

Re-check with every CB release (repo `dovrosenberg/fvtt-campaign-builder`):

- `static/module.json`: module id `campaign-builder`, compatibility.
- `src/classes/ExternalAPI.ts`: `module.api` (GM only, set in `src/hooks/ready.ts`). We only use
  `TOPICS` (with fallbacks); `getEntries(topic)` is deliberately not used (current setting only).
- `src/documents/indices.ts` (`entryIndexFields`, `TYPE_FIELD`) and `src/documents/types.ts`
  (`DOCUMENT_TYPES.Entry` = `campaign-builder.entry2`): how entries are recognized in the packs.
- `src/types/index.ts`: `Topics` enum (`Character = 1`, `PC = 4`); live values come from `api.TOPICS`.
- `src/documents/entry.ts`: page subtype `entry2`; we read only `system.topic`, `system.playerName`.
- `src/classes/Documents/FCBSetting.ts` (`createCompendium`): each CB setting is a world compendium
  labelled `FCB - <name>` (GM `OWNER`, others `LIMITED`). The label prefix is how we find the packs;
  if the CB ever changes it, `UPSTREAM.PACK_LABEL_PREFIX` is the one place to adapt.
- CB window: `src/applications/CampaignBuilder.ts` (id `app-fcb-CampaignBuilder`); extension
  there would be DOM injection into a Vue app (phase 2, optional, fragile).

## UI conventions

- **One click, no dialog.** A box click writes immediately and creates a log entry; the note is a
  plain input in the log entry, saved on `change` (blur/Enter). Never ask for a note first.
- **Removing is instant.** No confirmation; the panel shows an undo notice for `UNDO_SECONDS`
  (`TrackerStore.remove` / `restore`). The undo buffer is in memory only.
- **"Set aside"** (`active: false`) hides a tracker from the main list but keeps it in a collapsible section.
- The panel is a singleton (`TrackerPanel.open/toggle`), re-rendered from the `trackersUpdated` hook.
  Page names are cached while it is open; a deleted CB page shows as "no longer exists".
- Colors are validated (`#rrggbb`, `TrackerMath.isColor`) because they are written into inline
  `style` attributes; never relax that.
- **Entries are read from the CB's compendia, not from `module.api.getEntries`.** That API only knows the
  CB's *current setting*, which the CB sets when its window is first mounted; before that it returns
  nothing (an early version of the create form showed "No NPCs found" because of this). The bridge scans
  the world packs labelled `FCB - <setting>` instead (`CampaignBuilderBridge.npcs()/pcs()`, async). With
  several settings, choices carry the setting name. The remembered NPC/PC are applied once
  (`TrackerForm.#restoreLast`); the form offers "Refresh list" when nothing is found.
- **UUIDs are those of the wrapping JournalEntry** (like the CB's own `Entry.uuid`), not of the `entry2`
  page. `CampaignBuilderBridge.resolve` returns a JournalEntry; the page is `entry.pages.contents[0]`.
- **Every template part must render exactly one root element** (ApplicationV2 throws
  "must render a single HTML element" otherwise): `tracker-panel.hbs` and `tracker-form.hbs` are
  wrapped in a `*__root` div. Keep that when editing templates.
- Partial `tracker-card.hbs` is preloaded through the panel part's `templates` option and used as
  `{{> "modules/fcb-npc-trackers/templates/tracker-card.hbs" this}}`.
- Entry points: keybinding `Shift+Alt+N` (rebindable) and a button in the scene controls (token group).

## Release

- `.github/workflows/release.yaml`: on a pushed tag `vX.Y.Z` it runs `npm test`,
  writes version/url/manifest/download into `module.json` via jq, creates the GitHub
  release and attaches `module.json` + `module.zip`. Keep `module.json` URLs empty in the repo.
- Update `CHANGELOG.md` with every user-visible change.

## Roadmap

1. ~~Scaffold~~ (module.json, entry point, i18n, CI, CLAUDE.md)
2. ~~Core~~: `TrackerMath` + tests, DataModels, `TrackerStore`, `CampaignBuilderBridge`
3. ~~UI~~: tracker card, session panel, create/edit dialog, notes, remove with undo, scene control, keybinding
4. Templates: management dialog for custom templates (the world setting and store support exist)
5. Test in a real v14 world, fix what shows up, release v0.1.0
6. Optional: best-effort entry in the CB window, or upstream extension hook
7. Later: JSON export/import of trackers, link log entries to CB sessions (`api.getSessions()`)

## Testing

- Unit tests: `npm test` (Node ≥ 20, built-in `node:test`, no dependencies).
  Covers `tracker-math.mjs` and `tracker-templates.mjs`. Pure logic must stay free of
  Foundry globals so it remains testable this way; add tests with every change there.
- Manual test in a v14 world with the CB: enable both modules, reload, check the console for
  `fcb-npc-trackers |` logs. API in the console, e.g.
  `const api = game.modules.get("fcb-npc-trackers").api;`
  `const [npc] = game.modules.get("campaign-builder").api.getEntries(1);`
  `const t = await api.createTracker({ npcUuid: npc.uuid });`
  `await api.setValue(t.id, t.bars[0].id, 3, "Compliment");`
- Things to verify in a real v14 world (not coverable by unit tests): setting load/save with
  the DataModel types, `EmbeddedDataField` cleaning, orphan display with deleted CB entries,
  the `getSceneControlButtons` tool (shape of `controls` in v14), the `templates` option and
  `scrollable` of the panel part, `selectOptions` with `blank`, native detach of the panel window.
- Templates and CSS were rendered once with sample data outside Foundry (Handlebars + browser);
  that checks syntax and layout only, not Foundry's helpers or styles.
