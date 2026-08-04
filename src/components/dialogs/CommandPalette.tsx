import { Command, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OpenWordCommand } from "../../core/commands/types";
import { searchCommands } from "../../core/commands/registry";
import { Dialog } from "../common/Dialog";

interface CommandPaletteProps {
  open: boolean;
  commands: OpenWordCommand[];
  onClose: () => void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  const run = (command: OpenWordCommand | undefined) => {
    if (!command?.enabled) return;
    onClose();
    command.run();
  };

  return (
    <Dialog open={open} title="Command palette" onClose={onClose} width="medium">
      <div className="command-palette">
        <label className="command-palette__search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search commands</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command or feature"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((value) => Math.min(results.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(results[selected]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results" role="listbox" aria-label="Commands">
          {results.length ? results.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={selected === index}
              className={`command-result${selected === index ? " is-selected" : ""}`}
              disabled={!command.enabled}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(command)}
            >
              <Command size={16} aria-hidden="true" />
              <span>{command.label}</span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          )) : (
            <div className="command-empty">No commands match “{query}”.</div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
