export type WriterFormat = "docx" | "odt";

export type WriterCommand =
  | { type: "format.toggleBold" }
  | { type: "format.toggleItalic" }
  | { type: "format.toggleUnderline" }
  | { type: "history.undo" }
  | { type: "history.redo" };

export type WriterRequestMethod =
  | "engine.ping"
  | "document.new"
  | "document.open"
  | "document.save"
  | "command.execute";

export interface WriterRequest {
  kind: "request";
  id: string;
  method: WriterRequestMethod;
  params?: unknown;
}

export interface WriterError {
  code:
    | "ENGINE_UNAVAILABLE"
    | "TIMEOUT"
    | "INVALID_REQUEST"
    | "OPEN_FAILED"
    | "SAVE_FAILED"
    | "COMMAND_FAILED";
  message: string;
  detail?: string;
}

export type WriterResponse =
  | { kind: "response"; id: string; ok: true; result?: unknown }
  | { kind: "response"; id: string; ok: false; error: WriterError };

export type WriterEvent =
  | { kind: "event"; event: "engine.ready"; payload: { version: string } }
  | { kind: "event"; event: "document.changed"; payload: { dirty: boolean } }
  | {
      kind: "event";
      event: "selection.formatting";
      payload: { bold: boolean; italic: boolean; underline: boolean };
    }
  | { kind: "event"; event: "engine.failure"; payload: WriterError };

export function isWriterResponse(value: unknown): value is WriterResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "response" || typeof candidate.id !== "string" || typeof candidate.ok !== "boolean") {
    return false;
  }
  if (candidate.ok) return true;
  const error = candidate.error;
  return (
    !!error &&
    typeof error === "object" &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}

export function isWriterEvent(value: unknown): value is WriterEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "event" && typeof candidate.event === "string" && "payload" in candidate;
}
