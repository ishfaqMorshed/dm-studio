/** URL helpers shared by the Clients table and the client panel. */

/** The client's private brief form link. Briefs submitted through it land on this client's panel only. */
export function formLink(token: string): string {
  return `${window.location.origin}/brief/${token}`
}

/** 32 lowercase hex chars, the same shape as the database default for `clients.form_token`. */
export function freshFormToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fallback when `settings.n8n_base_url` is empty; the SOP's instance. */
const DEFAULT_N8N_BASE = 'https://n8n.srv1202488.hstgr.cloud'

/** Lead-only link to the n8n execution that handled a request. */
export function n8nExecutionUrl(base: string | null | undefined, executionId: string | null | undefined): string | null {
  if (!executionId) return null
  const root = (base && base.trim() ? base.trim() : DEFAULT_N8N_BASE).replace(/\/+$/, '')
  return `${root}/executions/${encodeURIComponent(executionId)}`
}
