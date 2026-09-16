/**
 * Edit-region masks: a white rectangle on black, exported at the generated image's
 * natural size and uploaded to gens `<card_id>/<generation_id>-mask.png`.
 */
import { GENS_BUCKET, storagePaths, supabase } from '../../lib/supabase'

/** Rectangle as fractions (0–1) of the image's width/height, so it survives any display size. */
export interface FractionRect {
  x: number
  y: number
  w: number
  h: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): FractionRect {
  const left = clamp01(Math.min(x1, x2))
  const top = clamp01(Math.min(y1, y2))
  const right = clamp01(Math.max(x1, x2))
  const bottom = clamp01(Math.max(y1, y2))
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** Rectangle in image pixels for readouts and the export. */
export function rectToPixels(rect: FractionRect, width: number, height: number) {
  const x = Math.round(rect.x * width)
  const y = Math.round(rect.y * height)
  const w = Math.max(1, Math.round(rect.w * width))
  const h = Math.max(1, Math.round(rect.h * height))
  return { x, y, w: Math.min(w, width - x), h: Math.min(h, height - y) }
}

/** Too small to mean anything: under 0.25 % of the image area. */
export function rectTooSmall(rect: FractionRect): boolean {
  return rect.w * rect.h < 0.0025
}

/** White rectangle on black at the image's natural size — the mask format the edit worker expects. */
export function buildMaskPng(width: number, height: number, rect: FractionRect): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Your browser could not create the mask canvas.'))
      return
    }
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    const px = rectToPixels(rect, width, height)
    ctx.fillRect(px.x, px.y, px.w, px.h)
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Mask export failed — the browser returned no PNG.'))
    }, 'image/png')
  })
}

/**
 * Uploads the mask; replaces an earlier mask for the same generation when the
 * bucket policy allows updates. Resolves with the storage path for request_edit.
 */
export async function uploadMask(cardId: string, generationId: string, blob: Blob): Promise<string> {
  const path = storagePaths.mask(cardId, generationId)
  const bucket = supabase.storage.from(GENS_BUCKET)
  const first = await bucket.upload(path, blob, { contentType: 'image/png', upsert: false })
  if (!first.error) return path
  if (/exist|duplicate/i.test(first.error.message)) {
    const second = await bucket.update(path, blob, { contentType: 'image/png' })
    if (!second.error) return path
    throw new Error(
      `A mask for this generation already exists and could not be replaced (${second.error.message}). Make the newest generation current and try again.`,
    )
  }
  throw new Error(`Mask upload failed: ${first.error.message}`)
}
