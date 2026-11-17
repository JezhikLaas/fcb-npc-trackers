# Campaign Builder: NPC Trackers

A Foundry VTT module for the [World & Campaign Builder](https://github.com/dovrosenberg/fvtt-campaign-builder)
that lets the GM track **how an NPC feels about a player character** – quickly, on the fly,
and prepared ahead of a session.

At a feast, Arno Pearl meets Aurelia von Halm. Depending on how the player roleplays and rolls,
her **sympathy** and **antipathy** towards Arno rise or fall. One click on a box changes the value,
and an optional note records why.
The module does not automate anything based on dice rolls; it is simply meant as a note-taking tool for the GM.

> **Status:** productive (0.4). Requires Foundry VTT v14 and World & Campaign Builder 1.10.1 or newer.

## Installation

In Foundry's setup screen: **Add-on Modules → Install Module**, paste the manifest URL
of the latest release into the field at the bottom and click **Install**:

```
https://github.com/JezhikLaas/fcb-npc-trackers/releases/latest/download/module.json
```

Then enable **Campaign Builder: NPC Trackers** in your world.

## AI Info
This module has been developed with the help of Claude Code.

## Using it

Open the **tracker panel** with `Shift+Alt+N` (rebindable in the controls settings) or with the
button in the scene controls. Choose **New tracker**, pick the NPC and the player character,
adjust the bars if you like, and save. Click a box to set a value; click the topmost filled box to step back.
Type a note into any log entry. The trash button removes a tracker immediately; **Undo** appears for a few seconds.

Collapse a card with the chevron in its header to keep a long list tidy, and drag a card by its header onto
another one to change the order. The export button writes the history of all trackers of that NPC into the
Campaign Builder entry (see *Transfer to the Campaign Builder* below).

## Features

- **Free trackers** – any number of bars per tracker (up to 6), each with its own number of steps (up to 12).
  The default template is *Sympathy / Antipathy* with 5 steps each.
- **One click** – click a box to set the value, click the topmost filled box to step back.
- **Log with notes** – every change is recorded; add a note to any change, before or after. Single log entries can be deleted.
- **In-world time** – log entries show the date and time of the world calendar, the real time, or both.
- **One tracker per NPC × PC pair** – Aurelia can feel differently about every character.
- **Prepare and keep** – trackers persist until you remove them. Set one aside to hide it from the session panel without deleting it.
- **Remove in one click** – with a few seconds to undo.
- **Collapsible cards** – a collapsed card shows only "NPC ↔ PC"; the panel remembers the state per card.
- **Your own order** – reorder cards by drag & drop; the order is saved right away.
- **Transfer to the Campaign Builder** – write the history into an editor field of the NPC's entry.
- **GM only.**

## Transfer to the Campaign Builder

The history can be written into a custom field of the NPC's Campaign Builder entry, so it stays with the NPC.

1. In the Campaign Builder settings, add a custom field of type **Editor** for characters, e.g. *Relationships*.
   Only editor fields keep the formatting, so other field types are not offered.
2. In this module's settings, choose that field under **Field for the history**.
3. Click the export button on a tracker card.

The field receives one section per player character with the current values and every change (oldest first,
with time and note). It is **overwritten on every transfer** with the history of all trackers of that NPC, so use
a field of its own. An error is shown when no field is chosen, the chosen field was deleted in the Campaign Builder
(or is no editor field any more), the NPC is only a free-text name, or its entry no longer exists.

## Settings

- **Time in the change log** – in-world and real time (default), in-world time with the real time as tooltip, or real time only.
- **Field for the history** – the Campaign Builder character field (type *Editor*) the export writes to.

## Macro API

```js
const api = game.modules.get("fcb-npc-trackers").api;
const cb = game.modules.get("campaign-builder").api;

const [npc] = cb.getEntries(cb.TOPICS.Character);
const [pc] = cb.getEntries(cb.TOPICS.PC);

const tracker = await api.createTracker({ npcUuid: npc.uuid, pcUuid: pc.uuid });
await api.setValue(tracker.id, tracker.bars[0].id, 3, "Complimented her dress");
api.openPanel({ npcUuid: npc.uuid });

// NPC and PC need not exist in the Campaign Builder: free-text names work as well
await api.createTracker({ npcName: "Gulfport Authorities", pcName: "Party" });

// Write the history of all trackers of an NPC into the configured Campaign Builder field
await api.exportHistory(npc.uuid);

// Move a tracker before (or, with true, after) another one
await api.moveTracker(trackerA.id, trackerB.id, false);
```

## Notes

- An NPC or PC is either a Campaign Builder entry (`npcUuid` / `pcUuid`) or a free-text name (`npcName` / `pcName`, e.g. an organisation or the whole party). A uuid always wins over a name; trackers with a manual NPC get their own entry in the panel's NPC filter.
- Tracker data is stored in a world setting (the Campaign Builder keeps its entries in compendium packs).
  Like every world setting it is technically readable by all connected clients; the module's interface is GM only.
- A Campaign Builder setting export does not include the trackers (the transferred history in an entry field does).
- The transfer only changes the chosen custom field. An open Campaign Builder window shows the new text after the
  entry is reopened.
- The panel lives in its own window because the Campaign Builder offers no extension point for its interface.
  In Foundry v14 it can be popped out next to the Campaign Builder window.

## License

MIT, see [LICENSE](LICENSE).
