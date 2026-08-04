import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankDocument } from "../core/document/factory";
import { useWorkspaceStore } from "./workspaceStore";

describe("workspace store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useWorkspaceStore.getState().resetForTests();
  });

  it("opens, edits, saves, switches, and closes documents", () => {
    const first = useWorkspaceStore.getState().tabs[0]!;
    const secondDocument = createBlankDocument("Second");
    useWorkspaceStore.getState().openDocument(secondDocument, { name: "Second.openword", format: "openword", path: "/tmp/Second.openword" });
    expect(useWorkspaceStore.getState().activeTabId).toBe(secondDocument.id);

    useWorkspaceStore.getState().updateDocument(secondDocument.id, { title: "Edited" });
    expect(useWorkspaceStore.getState().tabs.find((tab) => tab.id === secondDocument.id)?.dirty).toBe(true);

    useWorkspaceStore.getState().markSaved(secondDocument.id, { name: "Edited.openword", format: "openword", path: "/tmp/Edited.openword" });
    expect(useWorkspaceStore.getState().tabs.find((tab) => tab.id === secondDocument.id)?.dirty).toBe(false);

    useWorkspaceStore.getState().setActiveTab(first.id);
    useWorkspaceStore.getState().closeDocument(first.id);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
  });

  it("always keeps at least one document tab", () => {
    const only = useWorkspaceStore.getState().tabs[0]!;
    useWorkspaceStore.getState().closeDocument(only.id);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(useWorkspaceStore.getState().activeTabId).toBe(useWorkspaceStore.getState().tabs[0]!.id);
  });
});
