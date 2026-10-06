import { useEffect, useId, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Crop, Eraser, ImageOff } from 'lucide-react'
import type { AiPlatform } from '../../lib/types'
import { PlatformPicker } from '../PlatformPicker'
import { expandRectPx, normalizeRect, rectToPixels, rectTooSmall, ringPxFor, type FractionRect } from './mask'
import { btnPrimary, btnSecondary, btnSmall, checkerboard, inputCls, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

export interface EditRegionSubmit {
  rect: FractionRect
  natural: { w: number; h: number }
  instruction: string
  platform: AiPlatform
}

interface Size {
  w: number
  h: number
}

/**
 * Draw a rectangle on the current image (pointer drag on a canvas overlay, or type
 * pixel values). The page turns the rectangle into a black/white mask PNG at the
 * image's natural size, uploads it and queues the edit_region generation.
 *
 * Fix an area is "locked outside": GPT Image 2.5 Sunburst redraws the whole design and
 * region-composite keeps only the box, fading into the original over a ring of
 * `ringPct` % of the width. The ring is drawn as a dashed line around the box; nothing
 * beyond it changes.
 */
export function EditRegionDialog({
  imageUrl,
  imageBroken,
  ringPct,
  defaultPlatform,
  studioDefault,
  busy,
  onClose,
  onSubmit,
}: {
  imageUrl: string | null
  imageBroken: boolean
  /** settings.region_ring_pct: the soft-blend ring around the box, % of the image width (default 3). */
  ringPct: number
  /** Preselected platform; the picker follows it until the designer chooses (the page passes 'openrouter'). */
  defaultPlatform: AiPlatform
  /** settings.ai_platform, so the picker can say when the pick differs from the studio default. */
  studioDefault: AiPlatform
  busy: boolean
  onClose: () => void
  onSubmit: (args: EditRegionSubmit) => void
}) {
  const formId = useId()
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [natural, setNatural] = useState<Size | null>(null)
  const [display, setDisplay] = useState<Size>({ w: 0, h: 0 })
  const [rect, setRect] = useState<FractionRect | null>(null)
  const [instruction, setInstruction] = useState('')
  const [pickedPlatform, setPickedPlatform] = useState<AiPlatform | null>(null)
  const platform = pickedPlatform ?? defaultPlatform

  // Keep the overlay the same size as the displayed image.
  useEffect(() => {
    const img = imgRef.current
    if (!img || !imageUrl) return
    const update = () => setDisplay({ w: img.clientWidth, h: img.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(img)
    return () => ro.disconnect()
  }, [imageUrl])

  const ringPx = natural ? ringPxFor(natural.w, ringPct) : null

  // Paint the dimmed outside, the lighter blend ring, the clear box, the ring's dashed line and the box outline.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !display.w || !display.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(display.w * dpr)
    canvas.height = Math.round(display.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, display.w, display.h)
    if (!rect) return
    const x = rect.x * display.w
    const y = rect.y * display.h
    const w = rect.w * display.w
    const h = rect.h * display.h
    // The ring in display pixels: ring_px of the natural image, scaled like the picture.
    const ringDisplay = natural && ringPx ? (ringPx * display.w) / natural.w : 0
    const ring = expandRectPx({ x, y, w, h }, ringDisplay, display.w, display.h)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, display.w, display.h)
    ctx.clearRect(ring.x, ring.y, ring.w, ring.h)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(ring.x, ring.y, ring.w, ring.h)
    ctx.clearRect(x, y, w, h)
    if (ringDisplay > 0) {
      // 1 px dashed line where the blend ends: white dashes over black ones offset by half a period, readable on any colour.
      const rx = ring.x + 0.5
      const ry = ring.y + 0.5
      const rw = Math.max(0, ring.w - 1)
      const rh = Math.max(0, ring.h - 1)
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.lineDashOffset = 5
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.lineDashOffset = 0
      ctx.strokeStyle = '#ffffff'
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.setLineDash([])
    }
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(x, y, w, h)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2))
    ctx.setLineDash([])
  }, [rect, display, natural, ringPx])

  const toFraction = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (busy) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toFraction(e)
    dragStart.current = p
    setRect(normalizeRect(p.x, p.y, p.x, p.y))
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return
    const p = toFraction(e)
    setRect(normalizeRect(dragStart.current.x, dragStart.current.y, p.x, p.y))
  }
  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    if (!dragStart.current) return
    const p = toFraction(e)
    const r = normalizeRect(dragStart.current.x, dragStart.current.y, p.x, p.y)
    dragStart.current = null
    setRect(rectTooSmall(r) ? null : r)
  }

  const px = rect && natural ? rectToPixels(rect, natural.w, natural.h) : null

  /** Keyboard path: edit the rectangle in image pixels. */
  function setPx(patch: Partial<{ x: number; y: number; w: number; h: number }>) {
    if (!natural) return
    const cur = px ?? { x: 0, y: 0, w: Math.round(natural.w / 4), h: Math.round(natural.h / 4) }
    const next = { ...cur, ...patch }
    const x1 = next.x / natural.w
    const y1 = next.y / natural.h
    setRect(normalizeRect(x1, y1, x1 + next.w / natural.w, y1 + next.h / natural.h))
  }

  const canSubmit = Boolean(rect && natural && instruction.trim()) && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!rect || !natural || !canSubmit) return
    onSubmit({ rect, natural, instruction: instruction.trim(), platform })
  }

  return (
    <Dialog
      open
      size="xl"
      title="Fix an area"
      description="Drag a rectangle around the problem, then say what should change inside it. Everything beyond the dashed line stays exactly as it is."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => setRect(null)} disabled={!rect || busy} className={btnSecondary}>
            <Eraser className="h-4 w-4" />
            Clear rectangle
          </button>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : <Crop className="h-4 w-4" />}
            Queue region edit
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          {imageBroken ? (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 dark:border-neutral-800">
              <ImageOff className="mr-2 h-5 w-5" /> The image could not be loaded.
            </div>
          ) : !imageUrl ? (
            <div className="flex aspect-square items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 dark:border-neutral-800">
              <Spinner className="mr-2 h-5 w-5" /> Loading the image…
            </div>
          ) : (
            <div className={`relative inline-block max-w-full overflow-hidden rounded-xl ${checkerboard}`}>
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Current generation"
                draggable={false}
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="block max-h-[60vh] w-auto max-w-full select-none"
              />
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Drag to draw the region to change"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
              />
            </div>
          )}
          {rect && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
              <svg aria-hidden="true" viewBox="0 0 18 8" className="mt-1 h-2 w-[18px] shrink-0">
                <line x1="0" y1="4" x2="18" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              Pixels between your box and this line may be softly blended; nothing beyond this line will change.
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            {natural ? `Image ${natural.w} × ${natural.h} px.` : ''}{' '}
            {px
              ? `Region ${px.w} × ${px.h} px at (${px.x}, ${px.y}).${ringPx !== null ? ` Blend ring ${ringPx} px.` : ''}`
              : 'No region yet — drag on the image or type pixel values.'}
          </p>
        </div>

        <div className="space-y-4">
          <Field as="div" label="Region in pixels" hint="Keyboard alternative to dragging">
            <div className="grid grid-cols-4 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="text-xs">
                  <span className="mb-0.5 block uppercase text-neutral-500">{k}</span>
                  <input
                    type="number"
                    min={0}
                    max={natural ? (k === 'x' || k === 'w' ? natural.w : natural.h) : undefined}
                    value={px ? px[k] : ''}
                    disabled={!natural || busy}
                    onChange={(e) => setPx({ [k]: Math.max(0, Number(e.target.value) || 0) })}
                    className={`${inputCls} !px-1.5 tabular-nums`}
                  />
                </label>
              ))}
            </div>
          </Field>
          <Field label="What should change inside the rectangle" hint="Required">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={5}
              className={textareaCls}
              placeholder="e.g. remove the extra letter after CLIMBING; keep the same ink colour"
              data-autofocus
            />
          </Field>
          <PlatformPicker
            value={platform}
            onChange={setPickedPlatform}
            disabled={busy}
            studioDefault={studioDefault}
            size="sm"
          />
          {platform !== 'openrouter' && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Fix an area is tuned on OpenRouter. Kie runs the same request untested.
            </p>
          )}
          <p className="text-xs text-neutral-500">
            GPT Image 2.5 redraws the whole design; the app keeps only your area (about $0.07 per fix).
          </p>
          {rect && (
            <button type="button" onClick={() => setRect(null)} className={`${btnSecondary} ${btnSmall} lg:hidden`}>
              <Eraser className="h-3.5 w-3.5" />
              Clear rectangle
            </button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
