// Page geometry and pagination math.
//
// geometryFor() is the shared source of truth for page dimensions, used by
// both PageCanvas.svelte (to draw the page sheets) and
// src/editor/paginationPlugin.ts (to decide, per top-level block, whether it
// needs to be pushed onto the next page — see that file for the v2 reflow
// algorithm; see ARCHITECTURE.md's "Pagination" section for the overall
// design). computeBreaks() below is the older v1 whole-column break-line
// calculation kept around as a small, independently testable pure-math
// helper; it's no longer used for the live page-stack render (the plugin
// now measures per-block instead of using one continuous scrollHeight), but
// it's cheap to keep and correct on its own terms.

export const CSS_PX_PER_INCH = 96;

export interface PageSize {
  name: "letter" | "a4";
  widthIn: number;
  heightIn: number;
}

export const PAGE_SIZES: Record<string, PageSize> = {
  letter: { name: "letter", widthIn: 8.5, heightIn: 11 },
  a4: { name: "a4", widthIn: 8.27, heightIn: 11.69 },
};

export interface PageGeometry {
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  contentWidthPx: number;
  contentHeightPerPagePx: number;
}

export function geometryFor(pageSize: PageSize, marginIn = 1): PageGeometry {
  const pageWidthPx = Math.round(pageSize.widthIn * CSS_PX_PER_INCH);
  const pageHeightPx = Math.round(pageSize.heightIn * CSS_PX_PER_INCH);
  const marginPx = Math.round(marginIn * CSS_PX_PER_INCH);
  return {
    pageWidthPx,
    pageHeightPx,
    marginPx,
    contentWidthPx: pageWidthPx - marginPx * 2,
    contentHeightPerPagePx: pageHeightPx - marginPx * 2,
  };
}

export interface PageBreak {
  /** Offset from the top of the content column, in px. */
  offsetPx: number;
  /** The page number that starts after this break. */
  pageNumber: number;
}

/**
 * Given the total rendered height of the content column, compute where
 * page-break lines fall and how many pages the document spans.
 */
export function computeBreaks(contentHeightPx: number, geometry: PageGeometry): { breaks: PageBreak[]; pageCount: number } {
  const perPage = geometry.contentHeightPerPagePx;
  if (contentHeightPx <= 0 || perPage <= 0) return { breaks: [], pageCount: 1 };
  const pageCount = Math.max(1, Math.ceil(contentHeightPx / perPage));
  const breaks: PageBreak[] = [];
  for (let n = 1; n < pageCount; n++) {
    breaks.push({ offsetPx: n * perPage, pageNumber: n + 1 });
  }
  return { breaks, pageCount };
}
