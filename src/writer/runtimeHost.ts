import type { WriterRequest } from "./protocol";
import type { WriterTransport } from "./client";

export const REQUIRED_RUNTIME_FILES = [
  "soffice.js",
  "soffice.wasm",
  "soffice.data",
  "soffice.data.js.metadata",
  "zeta.js",
  "openword_writer_thread.js",
] as const;

export interface WriterRuntimeOptions {
  baseUrl?: string;
  startupTimeoutMs?: number;
}

export function runtimeAssetUrl(file: string, baseUrl = "./writer-runtime/"): string {
  if (/^(?:https?:|data:|\/\/)/i.test(baseUrl)) throw new Error("Remote Writer runtimes are forbidden");
  return `${baseUrl.replace(/\/?$/, "/")}${file}`;
}

function absoluteAssetUrl(file: string, baseUrl: string): string {
  return new URL(runtimeAssetUrl(file, baseUrl), document.baseURI).href;
}

function mkdirIfMissing(fs: EmscriptenFileSystem, path: string): void {
  try {
    fs.mkdir(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/exist/i.test(message)) throw error;
  }
}

function assertThreadedWasmSupport(): void {
  if (!globalThis.crossOriginIsolated) {
    throw new Error(
      "Writer requires cross-origin isolation. Configure COOP=same-origin and COEP=require-corp for both Tauri and the Vite development server.",
    );
  }
  if (typeof globalThis.SharedArrayBuffer === "undefined") {
    throw new Error("Writer requires SharedArrayBuffer support for its threaded WebAssembly runtime.");
  }
  if (typeof globalThis.WebAssembly === "undefined") {
    throw new Error("This system webview does not provide WebAssembly support.");
  }
}

export class WriterRuntimeHost {
  private readonly baseUrl: string;
  private readonly startupTimeoutMs: number;
  private port: MessagePort | null = null;
  private script: HTMLScriptElement | null = null;
  private module: OpenWordLowaModule | null = null;
  private started = false;

  constructor(options: WriterRuntimeOptions = {}) {
    this.baseUrl = options.baseUrl ?? "./writer-runtime/";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    runtimeAssetUrl("soffice.js", this.baseUrl);
  }

  async start(canvas: HTMLCanvasElement): Promise<WriterTransport> {
    if (this.started) throw new Error("Writer runtime has already been started");
    assertThreadedWasmSupport();
    this.started = true;

    const sofficeUrl = absoluteAssetUrl("soffice.js", this.baseUrl);
    const runtimeBaseUrl = new URL(this.baseUrl, document.baseURI).href;
    const module: OpenWordLowaModule = {
      canvas,
      uno_scripts: [
        absoluteAssetUrl("zeta.js", this.baseUrl),
        absoluteAssetUrl("openword_writer_thread.js", this.baseUrl),
      ],
      locateFile: (path: string, prefix?: string) => new URL(path, prefix || runtimeBaseUrl).href,
      // Emscripten workers cannot reliably infer a nested main-script URL.
      // Supplying the bootstrap as a Blob matches the supported ZetaOffice
      // integration pattern and keeps every worker import local.
      mainScriptUrlOrBlob: new Blob([`importScripts(${JSON.stringify(sofficeUrl)});`], {
        type: "text/javascript",
      }),
    };
    this.module = module;
    window.Module = module;

    try {
      await this.loadScript(sofficeUrl);
      const portPromise = module.uno_main;
      if (!portPromise) throw new Error("LOWA did not expose Module.uno_main");
      const port = await this.withTimeout(portPromise, "Writer runtime did not start in time");
      this.port = port;
      port.start?.();
      return this.createTransport(port);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  writeVirtualFile(path: string, bytes: Uint8Array): void {
    const fs = this.requireFs();
    mkdirIfMissing(fs, "/tmp");
    mkdirIfMissing(fs, "/tmp/openword");
    fs.writeFile(path, bytes);
  }

  readVirtualFile(path: string): Uint8Array {
    return this.requireFs().readFile(path);
  }

  removeVirtualFile(path: string): void {
    try {
      this.requireFs().unlink(path);
    } catch {
      // Cleanup is best-effort; callers already have the saved bytes.
    }
  }

  destroy(): void {
    this.port?.close();
    this.port = null;
    this.script?.remove();
    this.script = null;
    if (window.Module === this.module) delete window.Module;
    this.module = null;
    this.started = false;
  }

  private createTransport(port: MessagePort): WriterTransport {
    return {
      post(message: WriterRequest) {
        port.postMessage(message);
      },
      onMessage(listener: (message: unknown) => void) {
        const handler = (event: MessageEvent<unknown>) => listener(event.data);
        port.addEventListener("message", handler);
        return () => port.removeEventListener("message", handler);
      },
    };
  }

  private requireFs(): EmscriptenFileSystem {
    if (!window.FS) throw new Error("LOWA filesystem is not available");
    return window.FS;
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load local Writer runtime: ${src}`));
      this.script = script;
      document.head.appendChild(script);
    });
  }

  private withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(message)), this.startupTimeoutMs);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
