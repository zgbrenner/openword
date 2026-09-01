import { PAGE_SIZES, type PageSize } from "@/editor/pagination";

const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export class ViewState {
  zoom = $state(1);
  pageSize = $state<PageSize>(PAGE_SIZES.letter);
  showRuler = $state(true);

  zoomIn = () => {
    const next = ZOOM_STEPS.find((z) => z > this.zoom + 1e-6);
    this.zoom = next ?? this.zoom;
  };

  zoomOut = () => {
    const next = [...ZOOM_STEPS].reverse().find((z) => z < this.zoom - 1e-6);
    this.zoom = next ?? this.zoom;
  };

  zoomReset = () => {
    this.zoom = 1;
  };

  /** Drives `{#if view.showRuler}` in Ruler.svelte; toggled from the status bar. */
  toggleRuler = () => {
    this.showRuler = !this.showRuler;
  };

  /**
   * Switched from the status bar's page-size picker. PageCanvas.svelte
   * re-derives `geometryFor(view.pageSize)` from this and pushes the new
   * geometry into the pagination plugin, so the document re-lays out — the
   * plugin cannot observe plain Svelte state on its own.
   */
  setPageSize = (name: "letter" | "a4") => {
    this.pageSize = PAGE_SIZES[name];
  };
}
