export type DocxImageType = "png" | "jpg" | "gif" | "bmp";

export interface DecodedImage {
  data: Uint8Array;
  type: DocxImageType;
}

const SUPPORTED_MIME: Record<string, DocxImageType> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export function decodeDataImage(source: string): DecodedImage | null {
  const match = source.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;

  const type = SUPPORTED_MIME[match[1]!.toLowerCase()];
  if (!type) return null;

  try {
    const binary = atob(match[2]!);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      data[index] = binary.charCodeAt(index);
    }
    return { data, type };
  } catch {
    return null;
  }
}
