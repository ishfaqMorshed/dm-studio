import JSZip from 'jszip'
import { getSignedUrl } from './signedUrls'

/** One private object to fetch, plus the file name it should get on the designer's disk. */
export interface DownloadItem {
  bucket: string
  path: string
  filename: string
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : ''
  return ext || 'bin'
}

/** Strips characters that are illegal in file names on macOS/Windows. */
export function safeFileName(name: string, fallback = 'file'): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function fetchBlob(bucket: string, path: string): Promise<Blob> {
  const url = await getSignedUrl(bucket, path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path}`)
  return res.blob()
}

/** Download one private object under `item.filename`. */
export async function downloadFile(item: DownloadItem): Promise<void> {
  const blob = await fetchBlob(item.bucket, item.path)
  saveBlob(blob, item.filename)
}

export interface ZipProgress {
  done: number
  total: number
  current?: string
  phase: 'fetching' | 'zipping'
}

/**
 * Fetch each item sequentially, zip them client-side and save as `<zipName>.zip`.
 * Items that fail to fetch are skipped and reported in `failed` (by filename).
 */
export async function downloadAsZip(
  items: DownloadItem[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
): Promise<{ failed: string[] }> {
  const zip = new JSZip()
  const usedNames = new Set<string>()
  const failed: string[] = []
  const total = items.length

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    onProgress?.({ done: i, total, current: item.filename, phase: 'fetching' })
    try {
      const blob = await fetchBlob(item.bucket, item.path)
      let name = item.filename
      // De-duplicate names inside the archive.
      if (usedNames.has(name)) {
        const base = stripExt(name)
        const ext = extOf(name)
        let n = 2
        while (usedNames.has(`${base} (${n}).${ext}`)) n++
        name = `${base} (${n}).${ext}`
      }
      usedNames.add(name)
      zip.file(name, blob)
    } catch (e) {
      failed.push(item.filename)
      console.error(e)
    }
  }

  onProgress?.({ done: total, total, phase: 'zipping' })
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  saveBlob(out, `${safeFileName(zipName, 'download')}.zip`)
  return { failed }
}
