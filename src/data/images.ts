export interface PreparedImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Shrinks a photo in the browser before it is stored, so a 10 MB phone picture
 * becomes a couple of hundred kB. `cover` crops to exactly the given size.
 */
export async function prepareImage(file: Blob, maxWidth: number, maxHeight: number, cover = false): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = cover
    ? Math.max(maxWidth / bitmap.width, maxHeight / bitmap.height)
    : Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  const width = cover ? maxWidth : Math.round(bitmap.width * scale)
  const height = cover ? maxHeight : Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const drawnWidth = bitmap.width * scale
  const drawnHeight = bitmap.height * scale
  // When cropping, keep the upper part: faces are rarely at the bottom.
  canvas
    .getContext('2d')!
    .drawImage(bitmap, (width - drawnWidth) / 2, cover ? (height - drawnHeight) * 0.25 : 0, drawnWidth, drawnHeight)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
  if (!blob) throw new Error('This picture could not be read.')
  return { blob, width, height }
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
