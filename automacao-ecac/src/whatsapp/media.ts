// Download de mídia recebida pela Z-API: só HTTPS, com limite de tamanho e tipo conferido pelo conteúdo.
export const acceptedMedia: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export function detectMime(content: Buffer): string | null {
  if (content.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}
export class MediaError extends Error { constructor(readonly code: "too_large" | "unsupported" | "download_failed") { super(code); } }
export async function downloadMedia(url: string, maxBytes: number, fetcher: typeof fetch = fetch): Promise<{ content: Buffer; mime: string }> {
  if (!/^https:\/\//.test(url)) throw new MediaError("download_failed");
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), redirect: "follow" }).catch(() => { throw new MediaError("download_failed"); });
  if (!response.ok) throw new MediaError("download_failed");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new MediaError("too_large");
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > maxBytes) throw new MediaError("too_large");
  const mime = detectMime(content);
  if (!mime) throw new MediaError("unsupported");
  return { content, mime };
}
