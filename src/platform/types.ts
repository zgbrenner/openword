import type { WriterFormat } from "@/writer/protocol";

// The platform layer is the only seam between the Writer document lifecycle
// and where bytes actually live. The desktop backend persists through the
// Tauri shell to the real filesystem; the web backend persists through
// browser storage (File System Access handles, OPFS, and IndexedDB). Both
// must honor the same contract: a save never destroys the previous target
// until the complete new document exists, and recovery snapshots swap
// generations atomically.

export type PlatformKind = "desktop" | "web";

export interface MessageDialogOptions {
  title?: string;
  kind?: "info" | "warning" | "error";
}

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

/**
 * A picked document either has a durable platform path (a real filesystem
 * path on desktop; an opaque storage token on the web) or, when the platform
 * cannot provide a writable location (plain file-input fallback), the raw
 * bytes alone. Byte picks open detached, exactly like legacy migration:
 * the document requires Save As.
 */
export type DocumentPick =
  | { kind: "path"; path: string }
  | { kind: "bytes"; name: string; bytes: Uint8Array };

export interface SaveDialogOptions {
  defaultBaseName: string;
  filters: FileDialogFilter[];
  /**
   * How the web backend persists when the File System Access save picker is
   * unavailable: "browser-storage" keeps the document in OPFS so plain Save
   * keeps working (a copy is downloaded once at Save As); "download" hands
   * the bytes straight to the browser's download flow (used for exports).
   * The desktop backend ignores this.
   */
  webFallback: "browser-storage" | "download";
}

export interface DocumentReplaceResult {
  /**
   * Non-null when the previous target bytes were preserved somewhere the
   * user should know about (desktop keeps an undeletable backup file).
   */
  retainedBackupPath: string | null;
}

export interface RecoveryMetadata {
  version: 1;
  generation: string;
  createdAt: string;
  fileName: string;
  originalPath: string | null;
  format: WriterFormat;
  documentFile: string;
}

export interface RecoverySnapshot {
  metadata: RecoveryMetadata;
  bytes: Uint8Array;
}

export interface PlatformRecoveryStore {
  /** Persist a snapshot so that either the new generation or the previous one survives a crash, never neither. */
  write(metadata: RecoveryMetadata, bytes: Uint8Array): Promise<void>;
  read(): Promise<RecoverySnapshot | null>;
  clear(): Promise<void>;
}

export interface Platform {
  readonly kind: PlatformKind;

  ask(question: string, options?: MessageDialogOptions): Promise<boolean>;
  message(detail: string, options?: MessageDialogOptions): Promise<void>;

  pickOpenDocument(filters: FileDialogFilter[]): Promise<DocumentPick | null>;
  /** Returns a platform path for the chosen target, or null when cancelled. */
  pickSaveDocument(options: SaveDialogOptions): Promise<string | null>;

  readDocument(path: string): Promise<Uint8Array>;
  readDocumentText(path: string): Promise<string>;
  /** Atomically replace the document at `path` with `bytes`. */
  replaceDocument(path: string, bytes: Uint8Array): Promise<DocumentReplaceResult>;
  /** The user-facing file name for a platform path. */
  documentDisplayName(path: string): Promise<string>;

  readonly recovery: PlatformRecoveryStore;
}
