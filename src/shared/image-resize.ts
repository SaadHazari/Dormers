// Client-side photo downscale before upload (VER-03 convention):
// max 1600px on the long edge, JPEG q85 — keeps ops photos well under the
// 5 MB API limit on modern phone cameras.
export async function resizeToJpeg(file: Blob, maxPx = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality })
}
