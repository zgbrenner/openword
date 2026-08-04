import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { useWorkspaceStore } from "../store/workspaceStore";

describe("OpenWord application shell", () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetForTests();
  });

  it("renders the product and a document canvas", () => {
    render(<App />);

    expect(screen.getByText("OpenWord")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /document title/i })).toBeInTheDocument();
    expect(screen.getByTestId("document-editor")).toBeInTheDocument();
  });

  it("switches ribbon tabs", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Insert" }));
    expect(screen.getByRole("button", { name: /insert table/i })).toBeInTheDocument();
  });
});
