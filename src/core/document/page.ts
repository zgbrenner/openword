import type { PageSetup } from "./model";

export interface PageDimensions {
  widthInches: number;
  heightInches: number;
}

const PAGE_SIZES: Record<Exclude<PageSetup["size"], "custom">, PageDimensions> = {
  letter: { widthInches: 8.5, heightInches: 11 },
  a4: { widthInches: 8.2677, heightInches: 11.6929 },
  legal: { widthInches: 8.5, heightInches: 14 },
};

export function getPageDimensions(page: PageSetup): PageDimensions {
  const base =
    page.size === "custom"
      ? {
          widthInches: page.customWidthInches ?? 8.5,
          heightInches: page.customHeightInches ?? 11,
        }
      : PAGE_SIZES[page.size];

  return page.orientation === "landscape"
    ? {
        widthInches: base.heightInches,
        heightInches: base.widthInches,
      }
    : base;
}
