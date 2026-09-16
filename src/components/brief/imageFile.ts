import { IMAGE_EXTENSIONS, IMAGE_TYPES, MAX_IMAGE_BYTES, MIN_SHORT_SIDE_PX } from './constants'

/** A reference image the client picked, decoded and ready to upload. */
export interface ReferenceImage {
  file: File
  /** Object URL for the thumbnail; the slot revokes it when the image changes. */
  previewUrl: string
  width: number
  height: number
  /** Storage extension: png | jpg | webp. */
  ext: string
  /** Non-blocking advice, e.g. the image is small. */
  warning: string | null
}

export type ImageInspection = { ok: true; image: ReferenceImage } | { ok: false; error: string }

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Storage extension for an accepted file, or null when it is not PNG, JPG or WebP. */
export function imageExt(file: File): string | null {
  const type = file.type.toLowerCase()
  if (type) return IMAGE_TYPES[type] ?? null
  // Drag-and-drop and some mobile pickers hand over an empty MIME type; trust the name then.
  return IMAGE_EXTENSIONS[fileExtension(file.name)] ?? null
}

/** MIME type for a storage extension, for the upload's Content-Type when the File has none. */
export function mimeForExt(ext: string): string {
  const hit = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext)
  return hit ? hit[0] : 'application/octet-stream'
}

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('The browser could not decode the image'))
    img.src = url
  })
}

/**
 * Checks type and size, decodes the image to learn its pixel size and builds the preview URL.
 * Type and size problems block; a short side under 512 px only warns.
 */
export async function inspectImageFile(file: File): Promise<ImageInspection> {
  const ext = imageExt(file)
  if (!ext) {
    const got = fileExtension(file.name)
    return {
      ok: false,
      error: got
        ? `That file is a .${got}. Use a PNG, JPG or WebP image.`
        : 'That file type is not supported. Use a PNG, JPG or WebP image.',
    }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `This image is ${formatBytes(file.size)}. The limit is 15 MB — export a smaller version and try again.`,
    }
  }

  const previewUrl = URL.createObjectURL(file)
  try {
    const { width, height } = await readDimensions(previewUrl)
    if (!width || !height) throw new Error('Empty image')
    const short = Math.min(width, height)
    const warning =
      short < MIN_SHORT_SIDE_PX
        ? `Small image (${width} × ${height} px). It will be accepted, but at least ${MIN_SHORT_SIDE_PX} px on the short side gives a much better result.`
        : null
    return { ok: true, image: { file, previewUrl, width, height, ext, warning } }
  } catch {
    URL.revokeObjectURL(previewUrl)
    return { ok: false, error: 'We could not open this image. It may be damaged — export it again and retry.' }
  }
}
