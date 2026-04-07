/**
 * fileUtils — offline-safe file handling utilities.
 *
 * All attachments and images are stored as base64 data URLs in IndexedDB so
 * the application never depends on remote network resources at runtime.
 *
 * Design rules (CLAUDE.md — Offline-First):
 *  - External http(s) URLs are explicitly blocked by `isExternalUrl`.
 *  - Files are converted to self-contained data URLs via `fileToDataUrl`.
 *  - Attachment metadata (filename + data URL) is JSON-encoded into a single
 *    string so it can be stored in the existing `attachmentUrls: string[]`
 *    fields without a schema migration.
 *  - Downloads are triggered via a temporary <a> element to avoid any network
 *    requests.
 */

/** Maximum allowed file size (bytes). 10 MB per file. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

// ── Encoding ──────────────────────────────────────────────────────────────────

/** A locally stored attachment (filename + base64 data URL). */
export interface LocalFile {
  name: string
  dataUrl: string
}

/** Serialise a file's name and data URL into a single storable string. */
export function encodeLocalFile(name: string, dataUrl: string): string {
  return JSON.stringify({ name, dataUrl })
}

/**
 * Deserialise a stored string into a `LocalFile`.
 *
 * Accepts two formats:
 *  - JSON `{"name":"...","dataUrl":"data:..."}` — current format.
 *  - Plain data URL `data:...` — legacy/migrated data without a filename.
 *    The filename is inferred from the MIME type.
 *
 * Returns `null` for external http(s) URLs or unrecognised strings so callers
 * can skip them gracefully.
 */
export function decodeLocalFile(stored: string): LocalFile | null {
  if (!stored) return null

  // Block external URLs — should never reach here, but guard defensively.
  if (isExternalUrl(stored)) return null

  // Plain data URL (legacy/migrated)
  if (stored.startsWith('data:')) {
    const mime = getMimeFromDataUrl(stored)
    return { name: `file.${mimeToExt(mime)}`, dataUrl: stored }
  }

  // JSON-encoded LocalFile
  try {
    const parsed = JSON.parse(stored) as { name?: unknown; dataUrl?: unknown }
    if (typeof parsed.name === 'string' && typeof parsed.dataUrl === 'string') {
      return { name: parsed.name, dataUrl: parsed.dataUrl }
    }
  } catch {
    // not JSON — fall through
  }

  return null
}

// ── Conversion ─────────────────────────────────────────────────────────────────

/**
 * Read a `File` object and return its base64-encoded data URL.
 * Throws if the file exceeds `MAX_FILE_BYTES`.
 */
export function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(
      new Error(`File "${file.name}" exceeds the ${String(MAX_FILE_BYTES / 1024 / 1024)} MB limit`),
    )
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(reader.result as string) }
    reader.onerror = () => { reject(reader.error ?? new Error('FileReader error')) }
    reader.readAsDataURL(file)
  })
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Returns true when `url` is an external http / https link.
 * Use this to block any URL that would require a network request at runtime.
 */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

// ── Download ──────────────────────────────────────────────────────────────────

/**
 * Trigger a browser file-save dialog for a data URL.
 * No network request is made — the browser downloads from memory.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ── MIME helpers ──────────────────────────────────────────────────────────────

/** Extract the MIME type from a data URL, e.g. `"image/png"`. */
export function getMimeFromDataUrl(dataUrl: string): string {
  const m = /^data:([^;,]+)[;,]/.exec(dataUrl)
  return m?.[1] ?? 'application/octet-stream'
}

/** Map a MIME type string to a common file extension. */
export function mimeToExt(mime: string): string {
  const MAP: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/zip': 'zip',
    'text/plain': 'txt',
    'text/csv': 'csv',
  }
  return MAP[mime] ?? 'bin'
}

/** Human-readable file size string (e.g. "3.2 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
