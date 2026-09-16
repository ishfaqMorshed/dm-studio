/**
 * Copies text to the clipboard. Uses the async Clipboard API when the page is in a
 * secure context, otherwise the legacy selection path (http://localhost on another
 * device, older WebViews). Throws with a designer-readable message when both fail.
 */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the legacy path (permissions denied, etc.).
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    ta.remove()
  }
  if (!ok) throw new Error('This browser blocked the clipboard. Select the link and copy it by hand.')
}
