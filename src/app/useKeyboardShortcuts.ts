import { useEffect } from "react";

export interface KeyboardShortcutActions {
  open: () => void;
  save: () => void;
  saveAs: () => void;
  print: () => void;
  commandPalette: () => void;
  findReplace: () => void;
  backstage: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLocaleLowerCase();

      if (key === "o") {
        event.preventDefault();
        actions.open();
      } else if (key === "s" && event.shiftKey) {
        event.preventDefault();
        actions.saveAs();
      } else if (key === "s") {
        event.preventDefault();
        actions.save();
      } else if (key === "p") {
        event.preventDefault();
        actions.print();
      } else if (key === "k") {
        event.preventDefault();
        actions.commandPalette();
      } else if (key === "h" || key === "f") {
        event.preventDefault();
        actions.findReplace();
      } else if (key === ",") {
        event.preventDefault();
        actions.backstage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}
