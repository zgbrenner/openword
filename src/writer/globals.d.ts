declare global {
  interface EmscriptenFileSystem {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  }

  interface OpenWordLowaModule {
    canvas?: HTMLCanvasElement;
    uno_scripts?: string[];
    locateFile?: (path: string, prefix?: string) => string;
    mainScriptUrlOrBlob?: Blob;
    uno_main?: Promise<MessagePort>;
    [key: string]: unknown;
  }

  interface Window {
    Module?: OpenWordLowaModule;
    FS?: EmscriptenFileSystem;
  }
}

export {};
