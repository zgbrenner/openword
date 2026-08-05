import { inputRules, wrappingInputRule, textblockTypeInputRule, InputRule } from "prosemirror-inputrules";
import { schema } from "./schema";

// Small, familiar "type to format" affordances (same idea as Word/Docs
// autoformat: "- " -> bullet list, "1. " -> numbered list, "# " -> heading).
const bulletListRule = wrappingInputRule(/^\s*([-*])\s$/, schema.nodes.bullet_list);

const orderedListRule = wrappingInputRule(
  /^(\d+)\.\s$/,
  schema.nodes.ordered_list,
  (match) => ({ order: +match[1] }),
  (match, node) => node.childCount + node.attrs.order === +match[1],
);

const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
  level: match[1].length,
}));

const quoteDashRule = new InputRule(/--\s$/, "— ");

export function buildInputRules() {
  return inputRules({ rules: [bulletListRule, orderedListRule, headingRule, quoteDashRule] });
}
