export const WEB_PATH_PREFIX: string;

export type ParsedWebDocumentPath =
  | { scheme: "handle"; handleId: string; fileName: string }
  | { scheme: "opfs"; segments: string[]; fileName: string }
  | { scheme: "download"; fileName: string };

export function isWebDocumentPath(path: string): boolean;
export function sanitizeWebFileName(name: string): string;
export function handleWebPath(handleId: string, fileName: string): string;
export function opfsWebPath(directorySegments: string[], fileName: string): string;
export function downloadWebPath(fileName: string): string;
export function parseWebDocumentPath(path: string): ParsedWebDocumentPath | null;
export function webDocumentFileName(path: string): string;
