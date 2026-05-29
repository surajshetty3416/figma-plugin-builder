/**
 * Per-conversion cache: image hash → base64 data URL.
 *
 * Avoids redundant `getBytesAsync` calls when the same image asset is used
 * in multiple nodes (very common with Figma components/instances).
 * Call `clearImageCache()` at the start of each copy operation.
 */
const imageCache = new Map<string, string>();

export function clearImageCache(): void {
  imageCache.clear();
}

export async function getBase64ForHash(hash: string): Promise<string | null> {
  const cached = imageCache.get(hash);
  if (cached !== undefined) return cached;

  const image = figma.getImageByHash(hash);
  if (!image) return null;

  const bytes = await image.getBytesAsync();
  if (!bytes || bytes.length === 0) return null;

  const base64 = `data:image/png;base64,${figma.base64Encode(bytes)}`;
  imageCache.set(hash, base64);
  return base64;
}
