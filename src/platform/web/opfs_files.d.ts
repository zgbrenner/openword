export interface OpfsWritable {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface OpfsFileHandle {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<OpfsWritable>;
}

export interface OpfsDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

export function readOpfsFile(root: OpfsDirectoryHandle, segments: string[]): Promise<Uint8Array>;
export function writeOpfsFileAtomic(
  root: OpfsDirectoryHandle,
  segments: string[],
  bytes: Uint8Array,
): Promise<void>;
export function opfsFileExists(root: OpfsDirectoryHandle, segments: string[]): Promise<boolean>;
export function removeOpfsFile(root: OpfsDirectoryHandle, segments: string[]): Promise<void>;
