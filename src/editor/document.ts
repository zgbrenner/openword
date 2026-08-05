import { Node as PMNode } from "prosemirror-model";
import { schema } from "./schema";

export function emptyDoc(): PMNode {
  return schema.node("doc", null, [schema.node("paragraph")]);
}

export function docFromJSON(json: unknown): PMNode {
  return PMNode.fromJSON(schema, json as any);
}

export function docToJSON(doc: PMNode): unknown {
  return doc.toJSON();
}
