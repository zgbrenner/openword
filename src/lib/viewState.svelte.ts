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

  toggleRuler = () => {
    this.showRuler = !this.showRuler;
  };

  setPageSize = (name: "letter" | "a4") => {
    this.pageSize = PAGE_SIZES[name];
  };
}
