# Campaign Builder: NPC Trackers

A Foundry VTT module for the [World & Campaign Builder](https://github.com/dovrosenberg/fvtt-campaign-builder)
that lets the GM track **how an NPC feels about a player character** – quickly, on the fly,
and prepared ahead of a session.

At a feast, Arno Pearl meets Aurelia von Halm. Depending on how the player roleplays and rolls,
her **sympathy** and **antipathy** towards Arno rise or fall. One click on a box changes the value,
and an optional note records why.

> **Status:** pre-release (0.x). Data layer, API and the session panel are written but have not
> been tried in a real Foundry world yet. Requires Foundry VTT v14 and
> World & Campaign Builder 1.10.1 or newer.

## Using it

Open the **tracker panel** with `Shift+Alt+N` (rebindable in the controls settings) or with the
button in the scene controls. Choose **New tracker**, pick the NPC and the player character,
adjust the bars if you like, and save. Click a box to set a value; click the topmost filled box to step back.
Type a note into any log entry. The trash button removes a tracker immediately; **Undo** appears for a few seconds.

## Features

- **Free trackers** – any number of bars per tracker (up to 6), each with its own number of steps (up to 12).
  The default template is *Sympathy / Antipathy* with 5 steps each.
- **One click** – click a box to set the value, click the topmost filled box to step back.
- **Log with notes** – every change is recorded; add a note to any change, before or after.
- **One tracker per NPC × PC pair** – Aurelia can feel differently about every character.
- **Prepare and keep** – trackers persist until you remove them. Set one aside to hide it from the session panel without deleting it.
- **Remove in one click** – with a few seconds to undo.
- **GM only.**

## Macro API

```js
const api = game.modules.get("fcb-npc-trackers").api;
const cb = game.modules.get("campaign-builder").api;

const [npc] = cb.getEntries(cb.TOPICS.Character);
const [pc] = cb.getEntries(cb.TOPICS.PC);

const tracker = await api.createTracker({ npcUuid: npc.uuid, pcUuid: pc.uuid });
await api.setValue(tracker.id, tracker.bars[0].id, 3, "Complimented her dress");
api.openPanel({ npcUuid: npc.uuid });
```

## Notes

- Tracker data is stored in a world setting (the Campaign Builder keeps its entries in compendium packs).
  Like every world setting it is technically readable by all connected clients; the module's interface is GM only.
- A Campaign Builder setting export does not include the trackers.
- The panel lives in its own window because the Campaign Builder offers no extension point for its interface.
  In Foundry v14 it can be popped out next to the Campaign Builder window.

## License

MIT, see [LICENSE](LICENSE).
