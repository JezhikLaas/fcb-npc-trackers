/**
 * Ways to open the tracker panel: a scene control button and a keybinding (GM only).
 * @module entry-points
 */
import { I18N_PREFIX, KEYBINDINGS, MODULE_ID } from "./constants.mjs";
import { TrackerPanel } from "./apps/tracker-panel.mjs";

export class EntryPoints {
  /**
   * Register the keybinding and the scene control button. Call during the `init` hook.
   */
  static register() {
    game.keybindings.register(MODULE_ID, KEYBINDINGS.OPEN_PANEL, {
      name: `${I18N_PREFIX}.Keybindings.openPanel`,
      editable: [{ key: "KeyN", modifiers: ["Shift", "Alt"] }],
      restricted: true,
      onDown: () => {
        TrackerPanel.toggle();
        return true;
      }
    });

    Hooks.on("getSceneControlButtons", controls => {
      if (!game.user.isGM) return;
      const group = controls.tokens ?? Object.values(controls)[0];
      if (!group) return;
      group.tools[`${MODULE_ID}-panel`] = {
        name: `${MODULE_ID}-panel`,
        title: `${I18N_PREFIX}.SceneControl.title`,
        icon: "fa-solid fa-people-arrows",
        order: 100,
        button: true,
        visible: true,
        onChange: () => TrackerPanel.toggle()
      };
    });
  }
}
