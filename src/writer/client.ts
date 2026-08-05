import {
  isWriterEvent,
  isWriterResponse,
  type WriterCommand,
  type WriterError,
  type WriterEvent,
  type WriterFormat,
  type WriterRequest,
  type WriterRequestMethod,
} from "./protocol";

export interface WriterTransport {
  post(message: WriterRequest): void;
  onMessage(listener: (message: unknown) => void): () => void;
}

export interface WriterClientOptions {
  timeoutMs?: number;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: WriterClientError): void;
  timer: ReturnType<typeof setTimeout>;
}

export class WriterClientError extends Error {
  readonly code: WriterError["code"];
  readonly detail?: string;

  constructor(error: WriterError) {
    super(error.message);
    this.name = "WriterClientError";
    this.code = error.code;
    this.detail = error.detail;
  }
}

let fallbackSequence = 0;

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  fallbackSequence += 1;
  return `ow-${Date.now()}-${fallbackSequence}`;
}

export class WriterClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: WriterEvent) => void>();
  private readonly timeoutMs: number;
  private readonly unlisten: () => void;
  private destroyed = false;

  constructor(private readonly transport: WriterTransport, options: WriterClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.unlisten = transport.onMessage((message) => this.handleMessage(message));
  }

  ping(): Promise<{ ready: boolean }> {
    return this.request("engine.ping");
  }

  async newDocument(format: WriterFormat = "docx"): Promise<void> {
    await this.request("document.new", { format });
  }

  async openPath(path: string): Promise<void> {
    await this.request("document.open", { path });
  }

  async savePath(path: string, format: WriterFormat): Promise<void> {
    await this.request("document.save", { path, format });
  }

  async snapshotPath(path: string, format: WriterFormat): Promise<void> {
    await this.request("document.snapshot", { path, format });
  }

  async execute(command: WriterCommand): Promise<void> {
    await this.request("command.execute", { command });
  }

  subscribe(listener: (event: WriterEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unlisten();
    const error = new WriterClientError({ code: "ENGINE_UNAVAILABLE", message: "Writer client was destroyed" });
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.listeners.clear();
  }

  private request<T>(method: WriterRequestMethod, params?: unknown): Promise<T> {
    if (this.destroyed) {
      return Promise.reject(
        new WriterClientError({ code: "ENGINE_UNAVAILABLE", message: "Writer client is not available" }),
      );
    }

    const id = requestId();
    const message: WriterRequest = { kind: "request", id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new WriterClientError({ code: "TIMEOUT", message: `Writer request timed out: ${method}` }));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.transport.post(message);
    });
  }

  private handleMessage(message: unknown): void {
    if (isWriterEvent(message)) {
      for (const listener of this.listeners) listener(message);
      return;
    }
    if (!isWriterResponse(message)) return;

    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.ok) pending.resolve(message.result);
    else pending.reject(new WriterClientError(message.error));
  }
}
