# Changelog

## Unreleased

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
