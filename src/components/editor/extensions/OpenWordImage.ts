import Image from "@tiptap/extension-image";

export const OpenWordImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = Number(element.getAttribute("width"));
          return Number.isFinite(width) && width > 0 ? width : null;
        },
        renderHTML: (attributes) =>
          attributes.width ? { width: String(attributes.width) } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = Number(element.getAttribute("height"));
          return Number.isFinite(height) && height > 0 ? height : null;
        },
        renderHTML: (attributes) =>
          attributes.height ? { height: String(attributes.height) } : {},
      },
    };
  },
});
