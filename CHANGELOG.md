# Changelog

## Unreleased

- **In-world time in the log**: every change stores the world's game time (`game.time.worldTime`) next to the real time and shows it as a date of the world calendar (month names of the system or calendar module). New world setting "Time in the change log": in-world and real time (default), in-world time with real time as tooltip, or real time only. Entries made before this version keep showing the real time.
- **Delete log entries**: each log entry has a trash icon next to its heading; after confirmation the entry (and its note) is removed. Current bar values do not change. API: `removeLogEntry(trackerId, logId)`.
- Create/edit dialog is wider and puts the "own name" field on its own line so the selects stay readable.

- **Responsive bars**: the bar columns share the width of the window (56–240 px each); labels wrap instead of being cut off, bars of different heights share a baseline so the −/+ controls line up, and in a narrow window the log moves below the bars.
- **Own names**: the NPC and the player character can be a free-text name (e.g. "Gulfport Authorities", "Party") instead of a Campaign Builder entry. New data fields `npcName`/`pcName`, `createTracker({ npcName, pcName })`; existing trackers are unaffected. The dialog no longer blocks when the Campaign Builder has no NPCs.

- **Tracker panel** (`Shift+Alt+N` or scene control button): all trackers as cards with side-by-side bars that fill from the bottom, a change log with editable notes, filter per NPC, remove with undo, and a "set aside" section for prepared trackers.
- **New/edit dialog**: choose NPC (searchable), player character and template; rename bars, change steps and colors, add or remove bars.
- NPCs and player characters are read from the Campaign Builder's compendia (all settings), so they are available without opening the Campaign Builder window first.
- Macro API: `openPanel()`, `openCreateDialog()`.
- Project scaffold: manifest (requires World & Campaign Builder ≥ 1.10.1, Foundry v14), CI release workflow, English and German localization.
- Tracker data model with validation: up to 6 bars of up to 12 steps, change log with notes (200 entries per tracker).
- Click rules (set to box, step back on the topmost filled box) and templates (*Sympathy / Antipathy*, *Single bar*), with unit tests.
- Store with GM-only, serialized writes, removal with undo, and an orphan check for deleted Campaign Builder entries.
- Colors are validated before use.
- Public macro API under `game.modules.get("fcb-npc-trackers").api`.
