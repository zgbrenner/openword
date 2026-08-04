import Highlight from "@tiptap/extension-highlight";
import { ListKit } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { CommentMark } from "./extensions/CommentMark";
import { OpenWordImage } from "./extensions/OpenWordImage";
import { PageBreak } from "./extensions/PageBreak";
import { ParagraphLayout } from "./extensions/ParagraphLayout";

export function createEditorExtensions() {
  return [
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noreferrer noopener",
        },
      },
    }),
    ListKit.configure({
      taskItem: {
        nested: true,
      },
    }),
    TableKit.configure({
      table: {
        resizable: true,
        allowTableNodeSelection: true,
      },
    }),
    TextStyleKit,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Superscript,
    Subscript,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "Heading" : "Start writing…",
      showOnlyCurrent: true,
    }),
    OpenWordImage.configure({
      inline: true,
      allowBase64: true,
      HTMLAttributes: {
        class: "openword-image",
      },
    }),
    ParagraphLayout,
    CommentMark,
    PageBreak,
  ];
}
