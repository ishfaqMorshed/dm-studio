import { useEffect, useId, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Crop, Eraser, ImageOff } from 'lucide-react'
import { normalizeRect, rectToPixels, rectTooSmall, type FractionRect } from './mask'
import { btnPrimary, btnSecondary, btnSmall, checkerboard, inputCls, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

export interface EditRegionSubmit {
  rect: FractionRect
  natural: { w: number; h: number }
  instruction: string
}

interface Size {
  w: number
  h: number
}

/**
 * Draw a rectangle on the current image (pointer drag on a canvas overlay, or type
 * pixel values). The page turns the rectangle into a black/white mask PNG at the
 * image's natural size, uploads it and queues the edit_region generation.
 */
export function EditRegionDialog({
  imageUrl,
  imageBroken,
  busy,
  onClose,
  onSubmit,
}: {
  imageUrl: string | null
  imageBroken: boolean
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

  // Paint the dimmed outside + the rectangle outline.
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
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, 0, display.w, display.h)
    const x = rect.x * display.w
    const y = rect.y * display.h
    const w = rect.w * display.w
    const h = rect.h * display.h
    ctx.clearRect(x, y, w, h)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(x, y, w, h)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.setLineDash([4, 3])
    ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2))
    ctx.setLineDash([])
  }, [rect, display])

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
    onSubmit({ rect, natural, instruction: instruction.trim() })
  }

  return (
    <Dialog
      open
      size="xl"
      title="Edit region"
      description="Drag a rectangle around the problem, then say what should change inside it. Everything outside stays as it is."
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
          <p className="mt-1 text-xs text-neutral-500">
            {natural ? `Image ${natural.w} × ${natural.h} px.` : ''}{' '}
            {px ? `Region ${px.w} × ${px.h} px at (${px.x}, ${px.y}).` : 'No region yet — drag on the image or type pixel values.'}
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
          <p className="text-xs text-neutral-500">
            The mask is a white rectangle on black at full image size. After the edit, QC measures drift outside the mask and
            flags anything above 3 %.
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
