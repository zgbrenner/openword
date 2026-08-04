import type { JSONContent } from "@tiptap/core";
import { createBlankDocument } from "./factory";
import type { OpenWordDocument } from "./model";

export type TemplateId =
  | "blank"
  | "report"
  | "letter"
  | "legal-memo"
  | "meeting-notes";

export interface DocumentTemplate {
  id: TemplateId;
  name: string;
  description: string;
  content: JSONContent;
}

const paragraph = (text = ""): JSONContent => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : undefined,
});

const heading = (level: number, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

export const BUILT_IN_TEMPLATES: readonly DocumentTemplate[] = [
  {
    id: "blank",
    name: "Blank document",
    description: "A clean page with standard professional defaults.",
    content: { type: "doc", content: [paragraph()] },
  },
  {
    id: "report",
    name: "Professional report",
    description: "Title page, executive summary, findings, and recommendations.",
    content: {
      type: "doc",
      content: [
        heading(1, "Report title"),
        {
          type: "paragraph",
          attrs: { paragraphStyle: "subtitle" },
          content: [{ type: "text", text: "Prepared for Organization" }],
        },
        paragraph("Author · Date"),
        { type: "pageBreak" },
        heading(1, "Executive summary"),
        paragraph("Summarize the purpose, principal findings, and recommended action."),
        heading(1, "Background"),
        paragraph("Describe the relevant context and scope."),
        heading(1, "Findings"),
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("Finding one")] },
            { type: "listItem", content: [paragraph("Finding two")] },
          ],
        },
        heading(1, "Recommendations"),
        paragraph("Set out practical next steps, owners, and timing."),
      ],
    },
  },
  {
    id: "letter",
    name: "Business letter",
    description: "A restrained letter layout with address and signature placeholders.",
    content: {
      type: "doc",
      content: [
        paragraph("Your Name"),
        paragraph("Street Address"),
        paragraph("City, State ZIP"),
        paragraph("Email · Phone"),
        paragraph(),
        paragraph("Date"),
        paragraph(),
        paragraph("Recipient Name"),
        paragraph("Organization"),
        paragraph("Street Address"),
        paragraph("City, State ZIP"),
        paragraph(),
        paragraph("Dear Recipient:"),
        paragraph(),
        paragraph("Write the purpose of the letter clearly and directly."),
        paragraph(),
        paragraph("Sincerely,"),
        paragraph(),
        paragraph("Your Name"),
      ],
    },
  },
  {
    id: "legal-memo",
    name: "Legal memorandum",
    description: "Question presented, short answer, facts, discussion, and conclusion.",
    content: {
      type: "doc",
      content: [
        heading(1, "Memorandum"),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph("To")] },
                { type: "tableCell", content: [paragraph("Recipient")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph("From")] },
                { type: "tableCell", content: [paragraph("Author")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph("Date")] },
                { type: "tableCell", content: [paragraph("Date")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph("Re")] },
                { type: "tableCell", content: [paragraph("Matter")] },
              ],
            },
          ],
        },
        heading(2, "Question presented"),
        paragraph("State the precise legal question."),
        heading(2, "Short answer"),
        paragraph("Answer the question and identify the controlling reason."),
        heading(2, "Facts"),
        paragraph("Present legally significant facts objectively."),
        heading(2, "Discussion"),
        paragraph("Analyze the governing authorities and apply them to the facts."),
        heading(2, "Conclusion"),
        paragraph("State the likely result and any recommended action."),
      ],
    },
  },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "Agenda, decisions, and accountable follow-up items.",
    content: {
      type: "doc",
      content: [
        heading(1, "Meeting title"),
        paragraph("Date · Time · Location"),
        heading(2, "Attendees"),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("Name")] }],
        },
        heading(2, "Agenda"),
        {
          type: "orderedList",
          content: [{ type: "listItem", content: [paragraph("Agenda item")] }],
        },
        heading(2, "Notes"),
        paragraph(),
        heading(2, "Decisions"),
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("Decision")] }],
        },
        heading(2, "Action items"),
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [paragraph("Owner · Task · Due date")],
            },
          ],
        },
      ],
    },
  },
] as const;

export function createDocumentFromTemplate(templateId: TemplateId): OpenWordDocument {
  const template = BUILT_IN_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const title = template.id === "blank" ? "Untitled document" : template.name;
  const document = createBlankDocument(title);
  document.content = JSON.parse(JSON.stringify(template.content)) as JSONContent;
  return document;
}
