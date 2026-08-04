import { describe, expect, it, vi } from "vitest";
import { getCommands, searchCommands } from "./registry";
import type { CommandContext } from "./types";

function createContext(): CommandContext {
  return {
    editor: null,
    openBackstage: vi.fn(),
    openDocument: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn(),
    printDocument: vi.fn(),
    openFindReplace: vi.fn(),
    openPageSetup: vi.fn(),
    toggleNavigation: vi.fn(),
    toggleReview: vi.fn(),
  };
}

describe("command registry", () => {
  it("keeps document commands available without an editor and disables formatting commands", () => {
    const context = createContext();
    const commands = getCommands(context);

    expect(commands.find((command) => command.id === "open")?.enabled).toBe(true);
    expect(commands.find((command) => command.id === "bold")?.enabled).toBe(false);

    commands.find((command) => command.id === "open")?.run();
    expect(context.openDocument).toHaveBeenCalledOnce();
  });

  it("finds commands by keywords rather than labels alone", () => {
    const commands = getCommands(createContext());
    expect(searchCommands(commands, "margins").map((command) => command.id)).toEqual([
      "page-setup",
    ]);
  });
});
