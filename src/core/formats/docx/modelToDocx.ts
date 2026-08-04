import type { JSONContent } from "@tiptap/core";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak as DocxPageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  convertInchesToTwip,
  type FileChild,
  type ILevelsOptions,
  type ParagraphChild,
} from "docx";
import { extractPlainText } from "../../document/stats";
import { getPageDimensions } from "../../document/page";
import type { OpenWordDocument } from "../../document/model";
import { decodeDataImage } from "./imageData";

interface ConversionContext {
  warnings: string[];
  list?: {
    reference: "openword-bullet" | "openword-number";
    level: number;
  };
}

const HEADING_LEVELS: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const ALIGNMENTS: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function cssColorToHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();

  const shortHex = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    return shortHex[1]!
      .split("")
      .map((character) => `${character}${character}`)
      .join("")
      .toUpperCase();
  }

  const hex = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (hex) return hex[1]!.toUpperCase();

  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  return undefined;
}

function fontSizeHalfPoints(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (value.endsWith("px")) return Math.round(numeric * 0.75 * 2);
  return Math.round(numeric * 2);
}

function textRunOptions(node: JSONContent): Record<string, unknown> {
  const options: Record<string, unknown> = {
    text: node.text ?? "",
  };

  for (const mark of node.marks ?? []) {
    const attrs = mark.attrs ?? {};
    if (mark.type === "bold") options.bold = true;
    else if (mark.type === "italic") options.italics = true;
    else if (mark.type === "underline") {
      options.underline = { type: UnderlineType.SINGLE };
    } else if (mark.type === "strike") options.strike = true;
    else if (mark.type === "superscript") options.superScript = true;
    else if (mark.type === "subscript") options.subScript = true;
    else if (mark.type === "code") options.font = "Consolas";
    else if (mark.type === "highlight") {
      const fill = cssColorToHex(attrs.color);
      if (fill) options.shading = { type: ShadingType.CLEAR, fill, color: "auto" };
    } else if (mark.type === "textStyle") {
      if (typeof attrs.fontFamily === "string") options.font = attrs.fontFamily;
      const size = fontSizeHalfPoints(attrs.fontSize);
      if (size) options.size = size;
      const color = cssColorToHex(attrs.color);
      if (color) options.color = color;
      const fill = cssColorToHex(attrs.backgroundColor);
      if (fill) options.shading = { type: ShadingType.CLEAR, fill, color: "auto" };
    }
  }

  return options;
}

function paragraphChildren(
  content: JSONContent[] | undefined,
  context: ConversionContext,
): ParagraphChild[] {
  const children: ParagraphChild[] = [];

  for (const node of content ?? []) {
    if (node.type === "text") {
      const link = node.marks?.find((mark) => mark.type === "link");
      if (link && typeof link.attrs?.href === "string") {
        children.push(
          new ExternalHyperlink({
            link: link.attrs.href,
            children: [
              new TextRun({
                ...(textRunOptions(node) as ConstructorParameters<typeof TextRun>[0]),
                style: "Hyperlink",
              }),
            ],
          }),
        );
      } else {
        children.push(
          new TextRun(textRunOptions(node) as ConstructorParameters<typeof TextRun>[0]),
        );
      }
      continue;
    }

    if (node.type === "hardBreak") {
      children.push(new TextRun({ break: 1 }));
      continue;
    }

    if (node.type === "image") {
      const source = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const decoded = decodeDataImage(source);
      if (!decoded) {
        context.warnings.push(
          "An image could not be embedded in DOCX because it was not a supported PNG, JPEG, GIF, or BMP data image.",
        );
        const alt = String(node.attrs?.alt ?? "Image");
        children.push(new TextRun(`[${alt}]`));
        continue;
      }

      const width = Math.max(24, Math.min(700, Number(node.attrs?.width) || 480));
      const height = Math.max(24, Math.min(900, Number(node.attrs?.height) || Math.round(width * 0.66)));
      children.push(
        new ImageRun({
          data: decoded.data,
          type: decoded.type,
          transformation: { width, height },
          altText: {
            title: String(node.attrs?.title ?? ""),
            description: String(node.attrs?.alt ?? ""),
            name: String(node.attrs?.alt ?? "Image"),
          },
        }),
      );
    }
  }

  return children;
}

function textStyleLineHeight(node: JSONContent): number | undefined {
  for (const child of node.content ?? []) {
    const mark = child.marks?.find(
      (candidate) => candidate.type === "textStyle" && candidate.attrs?.lineHeight != null,
    );
    const numeric = Number.parseFloat(String(mark?.attrs?.lineHeight ?? ""));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return undefined;
}

function paragraphOptions(
  node: JSONContent,
  context: ConversionContext,
): ConstructorParameters<typeof Paragraph>[0] {
  const attrs = node.attrs ?? {};
  const level = Number(attrs.level) || 1;
  const style =
    attrs.paragraphStyle === "title"
      ? "Title"
      : attrs.paragraphStyle === "subtitle"
        ? "Subtitle"
        : attrs.paragraphStyle === "quote"
          ? "Quote"
          : undefined;
  const lineHeight = Number(attrs.lineHeight) || textStyleLineHeight(node);
  const before = Number(attrs.spacingBeforePt) || 0;
  const after = Number(attrs.spacingAfterPt);
  const indentLevel = Number(attrs.indentLevel) || 0;

  return {
    children: paragraphChildren(node.content, context),
    heading: node.type === "heading" ? HEADING_LEVELS[level] : undefined,
    style,
    alignment:
      typeof attrs.textAlign === "string" ? ALIGNMENTS[attrs.textAlign] : undefined,
    spacing: {
      before: Math.round(before * 20),
      after: Math.round((Number.isFinite(after) ? after : 8) * 20),
      line: typeof lineHeight === "number" && Number.isFinite(lineHeight) && lineHeight > 0
        ? Math.round(lineHeight * 240)
        : undefined,
    },
    indent: indentLevel > 0 ? { left: convertInchesToTwip(indentLevel * 0.5) } : undefined,
    numbering: context.list
      ? { reference: context.list.reference, level: Math.min(8, context.list.level) }
      : undefined,
  };
}

function convertList(
  node: JSONContent,
  context: ConversionContext,
  reference: "openword-bullet" | "openword-number",
  level = 0,
): FileChild[] {
  const output: FileChild[] = [];

  for (const item of node.content ?? []) {
    const itemContent = item.content ?? [];
    let emittedParagraph = false;
    let skippedTaskLead = false;

    if (item.type === "taskItem") {
      const checked = Boolean(item.attrs?.checked);
      const first = itemContent.find((child) => child.type === "paragraph");
      const content: JSONContent[] = [
        { type: "text", text: `${checked ? "☒" : "☐"} ` },
        ...(first?.content ?? []),
      ];
      output.push(
        new Paragraph(
          paragraphOptions(
            { ...(first ?? { type: "paragraph" }), content },
            { ...context, list: undefined },
          ),
        ),
      );
      emittedParagraph = true;
    }

    for (const child of itemContent) {
      if (child.type === "paragraph" || child.type === "heading") {
        if (item.type === "taskItem" && !skippedTaskLead) {
          skippedTaskLead = true;
          continue;
        }
        output.push(
          new Paragraph(
            paragraphOptions(child, {
              ...context,
              list: { reference, level },
            }),
          ),
        );
        emittedParagraph = true;
      } else if (
        child.type === "bulletList" ||
        child.type === "orderedList" ||
        child.type === "taskList"
      ) {
        const nestedReference =
          child.type === "orderedList" ? "openword-number" : "openword-bullet";
        output.push(...convertList(child, context, nestedReference, level + 1));
      } else {
        output.push(...convertBlock(child, context));
      }
    }

    if (!emittedParagraph) {
      output.push(
        new Paragraph(
          paragraphOptions(
            { type: "paragraph" },
            { ...context, list: { reference, level } },
          ),
        ),
      );
    }
  }

  return output;
}

function convertTable(node: JSONContent, context: ConversionContext): Table {
  const rows = (node.content ?? [])
    .filter((row) => row.type === "tableRow")
    .map(
      (row) =>
        new TableRow({
          children: (row.content ?? []).map((cell) => {
            const children = (cell.content ?? []).flatMap((child) => convertBlock(child, context));
            const safeChildren =
              children.length > 0 ? children : [new Paragraph({ children: [] })];
            return new TableCell({
              columnSpan: Math.max(1, Number(cell.attrs?.colspan) || 1),
              rowSpan: Math.max(1, Number(cell.attrs?.rowspan) || 1),
              children: safeChildren,
              shading:
                cell.type === "tableHeader"
                  ? { type: ShadingType.CLEAR, fill: "E8EEF7", color: "auto" }
                  : undefined,
            });
          }),
        }),
    );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "A8B1BF" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "A8B1BF" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "A8B1BF" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "A8B1BF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "CFD5DE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "CFD5DE" },
    },
  });
}

function convertBlock(node: JSONContent, context: ConversionContext): FileChild[] {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return [new Paragraph(paragraphOptions(node, context))];
    case "blockquote":
      return (node.content ?? []).flatMap((child) =>
        convertBlock(
          {
            ...child,
            attrs: { ...(child.attrs ?? {}), paragraphStyle: "quote" },
          },
          context,
        ),
      );
    case "codeBlock":
      return [
        new Paragraph({
          style: "Intense Quote",
          children: [
            new TextRun({
              text: node.content?.map((child) => child.text ?? "").join("") ?? "",
              font: "Consolas",
              size: 20,
            }),
          ],
        }),
      ];
    case "bulletList":
      return convertList(node, context, "openword-bullet");
    case "orderedList":
      return convertList(node, context, "openword-number");
    case "taskList":
      return convertList(node, context, "openword-bullet");
    case "table":
      return [convertTable(node, context)];
    case "horizontalRule":
      return [
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: "7A8491",
              space: 1,
            },
          },
        }),
      ];
    case "pageBreak":
      return [new Paragraph({ children: [new DocxPageBreak()] })];
    default:
      context.warnings.push(`DOCX export simplified unsupported node type "${node.type ?? "unknown"}".`);
      return (node.content ?? []).flatMap((child) => convertBlock(child, context));
  }
}

function numberingLevels(
  format: (typeof LevelFormat)[keyof typeof LevelFormat],
  bullet: boolean,
): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format,
    text: bullet ? ["•", "◦", "▪"][level % 3]! : `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: {
          left: 720 + level * 360,
          hanging: 360,
        },
      },
    },
  }));
}

function footerChildren(document: OpenWordDocument, context: ConversionContext): FileChild[] {
  if (extractPlainText(document.footer).trim()) {
    return (document.footer.content ?? []).flatMap((node) => convertBlock(node, context));
  }

  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: ["Page ", PageNumber.CURRENT] })],
    }),
  ];
}

export function modelToDocx(document: OpenWordDocument): {
  file: DocxDocument;
  warnings: string[];
} {
  const context: ConversionContext = { warnings: [] };
  const dimensions = getPageDimensions(document.page);
  const children = (document.content.content ?? []).flatMap((node) =>
    convertBlock(node, context),
  );
  const header = (document.header.content ?? []).flatMap((node) =>
    convertBlock(node, context),
  );

  if (document.comments.length > 0) {
    context.warnings.push(
      "OpenWord comments are not embedded as native Word comment threads in this release.",
    );
  }

  const file = new DocxDocument({
    creator: document.author ?? "OpenWord",
    title: document.title,
    description: "Created with OpenWord",
    numbering: {
      config: [
        {
          reference: "openword-bullet",
          levels: numberingLevels(LevelFormat.BULLET, true),
        },
        {
          reference: "openword-number",
          levels: numberingLevels(LevelFormat.DECIMAL, false),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: document.settings.defaultFontFamily,
            size: document.settings.defaultFontSizePt * 2,
            color: "171717",
          },
          paragraph: {
            spacing: { after: 160, line: 276 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(dimensions.widthInches),
              height: convertInchesToTwip(dimensions.heightInches),
              orientation:
                document.page.orientation === "landscape"
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: {
              top: convertInchesToTwip(document.page.marginsInches.top),
              right: convertInchesToTwip(document.page.marginsInches.right),
              bottom: convertInchesToTwip(document.page.marginsInches.bottom),
              left: convertInchesToTwip(document.page.marginsInches.left),
            },
          },
        },
        headers: header.length
          ? { default: new Header({ children: header }) }
          : undefined,
        footers: {
          default: new Footer({ children: footerChildren(document, context) }),
        },
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  });

  return { file, warnings: [...new Set(context.warnings)] };
}
