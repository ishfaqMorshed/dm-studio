import JSZip from 'jszip'
import { FINALS_BUCKET } from './supabase'
import { getSignedUrl } from './signedUrls'
import { stripExt, type Job } from './types'

export function finalFileName(job: Job): string {
  return `${stripExt(job.original_name)}_final.png`
}

function safeZipName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '-').trim()
  return `${cleaned || 'batch'}.zip`
}

function saveBlob(blob: Blob, filename: string) {
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

async function fetchFinalBlob(job: Job): Promise<Blob> {
  if (!job.final_path) throw new Error(`${job.original_name} has no final file yet`)
  const url = await getSignedUrl(FINALS_BUCKET, job.final_path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${job.original_name}`)
  return res.blob()
}

/** Download a single finished job as `<original name>_final.png`. */
export async function downloadJob(job: Job): Promise<void> {
  const blob = await fetchFinalBlob(job)
  saveBlob(blob, finalFileName(job))
}

export interface ZipProgress {
  done: number
  total: number
  current?: string
  phase: 'fetching' | 'zipping'
}

/**
 * Fetch each job's final image sequentially, zip them client-side, and save as `<zipName>.zip`.
 * Files that fail to fetch are skipped and reported in the returned `failed` list.
 */
export async function downloadJobsAsZip(
  jobs: Job[],
  zipName: string,
  onProgress?: (p: ZipProgress) => void,
): Promise<{ failed: string[] }> {
  const zip = new JSZip()
  const usedNames = new Set<string>()
  const failed: string[] = []
  const total = jobs.length

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]
    onProgress?.({ done: i, total, current: job.original_name, phase: 'fetching' })
    try {
      const blob = await fetchFinalBlob(job)
      let name = finalFileName(job)
      // De-duplicate names inside the archive.
      if (usedNames.has(name)) {
        let n = 2
        const base = stripExt(name)
        while (usedNames.has(`${base} (${n}).png`)) n++
        name = `${base} (${n}).png`
      }
      usedNames.add(name)
      zip.file(name, blob)
    } catch (e) {
      failed.push(job.original_name)
      console.error(e)
    }
  }

  onProgress?.({ done: total, total, phase: 'zipping' })
  const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  saveBlob(out, safeZipName(zipName))
  return { failed }
}
