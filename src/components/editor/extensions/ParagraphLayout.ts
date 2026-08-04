import { Extension, type CommandProps } from "@tiptap/core";

export type ParagraphStyleName =
  | "normal"
  | "title"
  | "subtitle"
  | "quote"
  | "compact";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphLayout: {
      setParagraphStyle: (style: ParagraphStyleName) => ReturnType;
      setParagraphSpacing: (beforePt: number, afterPt: number) => ReturnType;
      indentParagraph: () => ReturnType;
      outdentParagraph: () => ReturnType;
    };
  }
}

const TYPES = ["paragraph", "heading"];

export const ParagraphLayout = Extension.create({
  name: "paragraphLayout",

  addGlobalAttributes() {
    return [
      {
        types: TYPES,
        attributes: {
          paragraphStyle: {
            default: "normal",
            parseHTML: (element) =>
              element.getAttribute("data-paragraph-style") ??
              (element.classList.contains("openword-subtitle") ? "subtitle" : "normal"),
            renderHTML: (attributes) => {
              if (!attributes.paragraphStyle || attributes.paragraphStyle === "normal") return {};
              return {
                "data-paragraph-style": String(attributes.paragraphStyle),
                class: `openword-style-${String(attributes.paragraphStyle)}`,
              };
            },
          },
          indentLevel: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute("data-indent-level")) || 0,
            renderHTML: (attributes) =>
              Number(attributes.indentLevel) > 0
                ? {
                    "data-indent-level": String(attributes.indentLevel),
                    style: `margin-left:${Number(attributes.indentLevel) * 0.5}in`,
                  }
                : {},
          },
          spacingBeforePt: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute("data-spacing-before")) || 0,
            renderHTML: (attributes) =>
              Number(attributes.spacingBeforePt) > 0
                ? {
                    "data-spacing-before": String(attributes.spacingBeforePt),
                    style: `margin-top:${Number(attributes.spacingBeforePt)}pt`,
                  }
                : {},
          },
          spacingAfterPt: {
            default: 8,
            parseHTML: (element) => Number(element.getAttribute("data-spacing-after")) || 0,
            renderHTML: (attributes) =>
              Number(attributes.spacingAfterPt) >= 0
                ? {
                    "data-spacing-after": String(attributes.spacingAfterPt),
                    style: `margin-bottom:${Number(attributes.spacingAfterPt)}pt`,
                  }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const updateCurrentBlock =
      (attributes: Record<string, unknown>) =>
      ({ state, commands }: CommandProps) => {
        const type = state.selection.$from.parent.type.name;
        if (!TYPES.includes(type)) return false;
        return commands.updateAttributes(type, attributes);
      };

    return {
      setParagraphStyle:
        (style: ParagraphStyleName) =>
          updateCurrentBlock({ paragraphStyle: style }),
      setParagraphSpacing:
        (beforePt: number, afterPt: number) =>
          updateCurrentBlock({
            spacingBeforePt: Math.max(0, beforePt),
            spacingAfterPt: Math.max(0, afterPt),
          }),
      indentParagraph:
        () =>
        ({ state, commands }) => {
          const type = state.selection.$from.parent.type.name;
          if (!TYPES.includes(type)) return false;
          const current = Number(state.selection.$from.parent.attrs.indentLevel) || 0;
          return commands.updateAttributes(type, { indentLevel: Math.min(12, current + 1) });
        },
      outdentParagraph:
        () =>
        ({ state, commands }) => {
          const type = state.selection.$from.parent.type.name;
          if (!TYPES.includes(type)) return false;
          const current = Number(state.selection.$from.parent.attrs.indentLevel) || 0;
          return commands.updateAttributes(type, { indentLevel: Math.max(0, current - 1) });
        },
    };
  },
});
