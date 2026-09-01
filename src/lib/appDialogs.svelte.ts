// Promise-based modal dialog service for the web build, standing in for the
// native Tauri dialogs. Overlapping calls are queued so exactly one dialog is
// visible at a time; AppDialog.svelte renders `appDialogs.active`.

export interface DialogMessageOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
}

export interface SaveAsFormatOption {
  value: string;
  label: string;
  extension: string;
}

export interface SaveAsRequest {
  baseName: string;
  formats: SaveAsFormatOption[];
  title?: string;
  note?: string;
}

export interface SaveAsResult {
  name: string;
  format: string;
}

export type DialogKind = "info" | "warning" | "error";

export type ActiveDialog =
  | { type: "message"; title: string; detail: string; kind: DialogKind; resolve: () => void }
  | { type: "ask"; title: string; detail: string; kind: DialogKind; resolve: (answer: boolean) => void }
  | { type: "saveAs"; title: string; request: SaveAsRequest; resolve: (result: SaveAsResult | null) => void };

/** Trimmed name, or null when empty or containing path separators. */
export function sanitizeFileName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || /[/\\]/.test(trimmed)) return null;
  return trimmed;
}

export function fileNameWithExtension(name: string, format: SaveAsFormatOption): string {
  const extension = format.extension.startsWith(".") ? format.extension : `.${format.extension}`;
  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`;
}

class AppDialogService {
  active = $state<ActiveDialog | null>(null);
  #queue: ActiveDialog[] = [];

  #enqueue(dialog: ActiveDialog): void {
    if (this.active) this.#queue.push(dialog);
    else this.active = dialog;
  }

  #next(): void {
    this.active = this.#queue.shift() ?? null;
  }

  message(detail: string, options: DialogMessageOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      this.#enqueue({
        type: "message",
        title: options.title ?? "OpenWord",
        detail,
        kind: options.kind ?? "info",
        resolve,
      });
    });
  }

  ask(question: string, options: DialogMessageOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.#enqueue({
        type: "ask",
        title: options.title ?? "OpenWord",
        detail: question,
        kind: options.kind ?? "info",
        resolve,
      });
    });
  }

  saveAs(request: SaveAsRequest): Promise<SaveAsResult | null> {
    return new Promise((resolve) => {
      this.#enqueue({ type: "saveAs", title: request.title ?? "Save As", request, resolve });
    });
  }

  // The methods below are called by AppDialog.svelte to settle the active
  // dialog. They resolve after advancing the queue so a re-prompt from the
  // resolver lands behind any already queued dialogs' turn correctly.

  confirmMessage(): void {
    if (this.active?.type !== "message") return;
    const { resolve } = this.active;
    this.#next();
    resolve();
  }

  answer(value: boolean): void {
    if (this.active?.type !== "ask") return;
    const { resolve } = this.active;
    this.#next();
    resolve(value);
  }

  /** Returns false (dialog stays open) for an invalid name or unknown format. */
  confirmSaveAs(name: string, formatValue: string): boolean {
    if (this.active?.type !== "saveAs") return false;
    const sanitized = sanitizeFileName(name);
    const format = this.active.request.formats.find((option) => option.value === formatValue);
    if (!sanitized || !format) return false;
    const { resolve } = this.active;
    this.#next();
    resolve({ name: fileNameWithExtension(sanitized, format), format: format.value });
    return true;
  }

  /** Dismiss the active dialog: message resolves, ask → false, saveAs → null. */
  cancel(): void {
    const dialog = this.active;
    if (!dialog) return;
    this.#next();
    if (dialog.type === "message") dialog.resolve();
    else if (dialog.type === "ask") dialog.resolve(false);
    else dialog.resolve(null);
  }
}

export const appDialogs = new AppDialogService();
