import { baseKeymap, chainCommands, exitCode, joinDown, joinUp, selectParentNode } from "prosemirror-commands";
import { undo, redo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import type { Command } from "prosemirror-state";
import { schema } from "./schema";
import { toggleMarkCommand, toggleList, changeIndent, insertPageBreak } from "./commands";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "Cmd" : "Ctrl";

function bind(keys: Record<string, Command>): Record<string, Command> {
  return keys;
}

export const buildKeymap = () =>
  bind({
    // baseKeymap first: it's the fallback for Enter/Backspace/Delete/Mod-a.
    // Our own bindings below must come last in the object so they win when
    // a key collides after normalization (e.g. our "Mod-Enter" would
    // otherwise be silently shadowed by baseKeymap's "Mod-Enter": exitCode,
    // since prosemirror-keymap builds its lookup by normalized key name and
    // later entries in iteration order overwrite earlier ones).
    ...baseKeymap,

    [`${mod}-z`]: chainCommands(undoInputRule, undo),
    [`${mod}-y`]: redo,
    [`${mod}-Shift-z`]: redo,

    [`${mod}-b`]: toggleMarkCommand(schema.marks.bold),
    [`${mod}-i`]: toggleMarkCommand(schema.marks.italic),
    [`${mod}-u`]: toggleMarkCommand(schema.marks.underline),

    [`${mod}-Shift-8`]: toggleList(schema.nodes.bullet_list),
    [`${mod}-Shift-7`]: toggleList(schema.nodes.ordered_list),

    Tab: changeIndent(1),
    "Shift-Tab": changeIndent(-1),

    [`${mod}-Enter`]: insertPageBreak(),
    "Shift-Enter": (state, dispatch) => {
      if (!dispatch) return true;
      dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
      return true;
    },

    "Mod-BracketLeft": changeIndent(-1),
    "Mod-BracketRight": changeIndent(1),

    "Alt-ArrowUp": joinUp,
    "Alt-ArrowDown": joinDown,
    "Escape": selectParentNode,
  });

export { exitCode };
