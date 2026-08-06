/* SPDX-License-Identifier: Apache-2.0 */
"use strict";

const OPENWORD_MARGIN_PRESETS = Object.freeze({
  normal: Object.freeze({ left: 2540, right: 2540, top: 2540, bottom: 2540 }),
  narrow: Object.freeze({ left: 1270, right: 1270, top: 1270, bottom: 1270 }),
  moderate: Object.freeze({ left: 1905, right: 1905, top: 2540, bottom: 2540 }),
  wide: Object.freeze({ left: 5080, right: 5080, top: 2540, bottom: 2540 }),
});

const OPENWORD_PAPER_SIZES = Object.freeze({
  letter: Object.freeze({ width: 21590, height: 27940 }),
  a4: Object.freeze({ width: 21000, height: 29700 }),
  legal: Object.freeze({ width: 21590, height: 35560 }),
});

function finitePageNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function marginPresetFrom(readProperty) {
  const actual = {
    left: finitePageNumber(readProperty("LeftMargin")),
    right: finitePageNumber(readProperty("RightMargin")),
    top: finitePageNumber(readProperty("TopMargin")),
    bottom: finitePageNumber(readProperty("BottomMargin")),
  };
  if (Object.values(actual).some((value) => value === null)) return "custom";

  const tolerance = 20;
  for (const [name, preset] of Object.entries(OPENWORD_MARGIN_PRESETS)) {
    if (
      Math.abs(actual.left - preset.left) <= tolerance &&
      Math.abs(actual.right - preset.right) <= tolerance &&
      Math.abs(actual.top - preset.top) <= tolerance &&
      Math.abs(actual.bottom - preset.bottom) <= tolerance
    ) {
      return name;
    }
  }
  return "custom";
}

function paperSizeFrom(readProperty) {
  const width = finitePageNumber(readProperty("Width"));
  const height = finitePageNumber(readProperty("Height"));
  if (width === null || height === null) return "custom";
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const tolerance = 20;
  for (const [name, size] of Object.entries(OPENWORD_PAPER_SIZES)) {
    if (
      Math.abs(shortSide - size.width) <= tolerance &&
      Math.abs(longSide - size.height) <= tolerance
    ) {
      return name;
    }
  }
  return "custom";
}

var OPENWORD_WRITER_PAGE_STYLES = Object.freeze({
  updatesFor(command, readProperty = () => undefined) {
    const type = command && command.type;

    switch (type) {
      case "header.setEnabled":
      case "footer.setEnabled":
      case "pageStyle.setDifferentFirstPage":
      case "pageStyle.setDifferentOddEven": {
        if (typeof command.enabled !== "boolean") {
          throw new Error("Page-style commands require an enabled boolean");
        }
        if (type === "header.setEnabled") {
          return [{ property: "HeaderIsOn", value: command.enabled }];
        }
        if (type === "footer.setEnabled") {
          return [{ property: "FooterIsOn", value: command.enabled }];
        }
        if (type === "pageStyle.setDifferentFirstPage") {
          return [{ property: "FirstIsShared", value: !command.enabled }];
        }
        return [
          { property: "HeaderIsShared", value: !command.enabled },
          { property: "FooterIsShared", value: !command.enabled },
        ];
      }

      case "pageStyle.setMargins": {
        const preset = OPENWORD_MARGIN_PRESETS[command.preset];
        if (!preset) throw new Error(`Unsupported page-margin preset: ${String(command.preset)}`);
        return [
          { property: "LeftMargin", value: preset.left },
          { property: "RightMargin", value: preset.right },
          { property: "TopMargin", value: preset.top },
          { property: "BottomMargin", value: preset.bottom },
        ];
      }

      case "pageStyle.setOrientation": {
        if (command.orientation !== "portrait" && command.orientation !== "landscape") {
          throw new Error(`Unsupported page orientation: ${String(command.orientation)}`);
        }
        const landscape = command.orientation === "landscape";
        const width = finitePageNumber(readProperty("Width"));
        const height = finitePageNumber(readProperty("Height"));
        const updates = [{ property: "IsLandscape", value: landscape }];
        if (width !== null && height !== null) {
          const dimensionsAreLandscape = width > height;
          if (dimensionsAreLandscape !== landscape) {
            updates.push(
              { property: "Width", value: height },
              { property: "Height", value: width },
            );
          }
        }
        return updates;
      }

      case "pageStyle.setPaperSize": {
        const size = OPENWORD_PAPER_SIZES[command.paperSize];
        if (!size) throw new Error(`Unsupported paper size: ${String(command.paperSize)}`);
        const currentWidth = finitePageNumber(readProperty("Width"));
        const currentHeight = finitePageNumber(readProperty("Height"));
        const landscape = Boolean(readProperty("IsLandscape")) ||
          (currentWidth !== null && currentHeight !== null && currentWidth > currentHeight);
        return landscape
          ? [
              { property: "Width", value: size.height },
              { property: "Height", value: size.width },
            ]
          : [
              { property: "Width", value: size.width },
              { property: "Height", value: size.height },
            ];
      }

      default:
        throw new Error(`Unsupported page-style command: ${String(type)}`);
    }
  },

  read(pageStyleName, readProperty) {
    const headerShared = Boolean(readProperty("HeaderIsShared"));
    const footerShared = Boolean(readProperty("FooterIsShared"));
    const width = finitePageNumber(readProperty("Width"));
    const height = finitePageNumber(readProperty("Height"));
    const landscapeFlag = Boolean(readProperty("IsLandscape"));
    const orientation = landscapeFlag || (width !== null && height !== null && width > height)
      ? "landscape"
      : "portrait";

    return {
      pageStyleName,
      headerEnabled: Boolean(readProperty("HeaderIsOn")),
      footerEnabled: Boolean(readProperty("FooterIsOn")),
      differentFirstPage: !Boolean(readProperty("FirstIsShared")),
      differentOddEven: !headerShared || !footerShared,
      orientation,
      marginPreset: marginPresetFrom(readProperty),
      paperSize: paperSizeFrom(readProperty),
    };
  },
});
