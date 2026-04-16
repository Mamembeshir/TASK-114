/**
 * Unit tests for fileUtils pure functions.
 * DOM-dependent functions (fileToDataUrl, downloadDataUrl) are not tested here.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_FILE_BYTES,
  encodeLocalFile,
  decodeLocalFile,
  isExternalUrl,
  fileToDataUrl,
  downloadDataUrl,
  getMimeFromDataUrl,
  mimeToExt,
  formatBytes,
} from '@/utils/fileUtils'

describe('MAX_FILE_BYTES', () => {
  it('equals 10 MB in bytes', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024)
  })
})

describe('isExternalUrl', () => {
  it('returns true for http URLs', () => {
    expect(isExternalUrl('http://example.com/image.png')).toBe(true)
  })

  it('returns true for https URLs', () => {
    expect(isExternalUrl('https://example.com/image.png')).toBe(true)
  })

  it('returns true for uppercase HTTP', () => {
    expect(isExternalUrl('HTTP://EXAMPLE.COM/')).toBe(true)
  })

  it('returns false for data URLs', () => {
    expect(isExternalUrl('data:image/png;base64,abc123')).toBe(false)
  })

  it('returns false for relative paths', () => {
    expect(isExternalUrl('/uploads/file.png')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isExternalUrl('')).toBe(false)
  })

  it('trims leading whitespace before checking', () => {
    expect(isExternalUrl('   https://example.com')).toBe(true)
  })
})

describe('encodeLocalFile', () => {
  it('produces valid JSON with name and dataUrl', () => {
    const encoded = encodeLocalFile('photo.jpg', 'data:image/jpeg;base64,abc')
    const parsed = JSON.parse(encoded) as { name: string; dataUrl: string }
    expect(parsed.name).toBe('photo.jpg')
    expect(parsed.dataUrl).toBe('data:image/jpeg;base64,abc')
  })

  it('round-trips through decodeLocalFile', () => {
    const encoded = encodeLocalFile('doc.pdf', 'data:application/pdf;base64,xyz')
    const decoded = decodeLocalFile(encoded)
    expect(decoded).toEqual({ name: 'doc.pdf', dataUrl: 'data:application/pdf;base64,xyz' })
  })
})

describe('decodeLocalFile', () => {
  it('returns null for empty string', () => {
    expect(decodeLocalFile('')).toBeNull()
  })

  it('returns null for external http URL', () => {
    expect(decodeLocalFile('https://example.com/file.png')).toBeNull()
  })

  it('decodes JSON-encoded LocalFile', () => {
    const stored = JSON.stringify({ name: 'test.png', dataUrl: 'data:image/png;base64,abc' })
    const result = decodeLocalFile(stored)
    expect(result).toEqual({ name: 'test.png', dataUrl: 'data:image/png;base64,abc' })
  })

  it('handles legacy plain data URL with inferred name', () => {
    const result = decodeLocalFile('data:image/png;base64,abc123')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('file.png')
    expect(result!.dataUrl).toBe('data:image/png;base64,abc123')
  })

  it('infers pdf extension for PDF data URLs', () => {
    const result = decodeLocalFile('data:application/pdf;base64,xyz')
    expect(result!.name).toBe('file.pdf')
  })

  it('returns null for invalid JSON', () => {
    expect(decodeLocalFile('not-json-not-data-url')).toBeNull()
  })

  it('returns null for JSON missing required fields', () => {
    expect(decodeLocalFile(JSON.stringify({ name: 'test.png' }))).toBeNull()
  })

  it('returns null for JSON with wrong types', () => {
    expect(decodeLocalFile(JSON.stringify({ name: 123, dataUrl: true }))).toBeNull()
  })
})

describe('getMimeFromDataUrl', () => {
  it('extracts image/png MIME type', () => {
    expect(getMimeFromDataUrl('data:image/png;base64,abc')).toBe('image/png')
  })

  it('extracts application/pdf MIME type', () => {
    expect(getMimeFromDataUrl('data:application/pdf;base64,xyz')).toBe('application/pdf')
  })

  it('extracts MIME from data URL without base64 encoding', () => {
    expect(getMimeFromDataUrl('data:text/plain,hello')).toBe('text/plain')
  })

  it('returns application/octet-stream for unrecognised format', () => {
    expect(getMimeFromDataUrl('not-a-data-url')).toBe('application/octet-stream')
  })
})

describe('mimeToExt', () => {
  it('maps image/jpeg → jpg', () => {
    expect(mimeToExt('image/jpeg')).toBe('jpg')
  })

  it('maps image/png → png', () => {
    expect(mimeToExt('image/png')).toBe('png')
  })

  it('maps application/pdf → pdf', () => {
    expect(mimeToExt('application/pdf')).toBe('pdf')
  })

  it('maps text/csv → csv', () => {
    expect(mimeToExt('text/csv')).toBe('csv')
  })

  it('returns bin for unknown MIME type', () => {
    expect(mimeToExt('application/unknown-type')).toBe('bin')
  })

  it('maps image/gif → gif', () => {
    expect(mimeToExt('image/gif')).toBe('gif')
  })

  it('maps image/webp → webp', () => {
    expect(mimeToExt('image/webp')).toBe('webp')
  })

  it('maps image/svg+xml → svg', () => {
    expect(mimeToExt('image/svg+xml')).toBe('svg')
  })

  it('maps application/zip → zip', () => {
    expect(mimeToExt('application/zip')).toBe('zip')
  })
})

describe('fileToDataUrl', () => {
  it('rejects a file that exceeds MAX_FILE_BYTES', async () => {
    const oversized = new File(['x'.repeat(10)], 'big.bin', { type: 'application/octet-stream' })
    // Bypass the actual size — create a File-like object with a large size property
    Object.defineProperty(oversized, 'size', { value: MAX_FILE_BYTES + 1 })
    await expect(fileToDataUrl(oversized)).rejects.toThrow(/exceeds/)
  })

  it('resolves a data URL for a small text file', async () => {
    const content = 'hello world'
    const file = new File([content], 'test.txt', { type: 'text/plain' })
    const result = await fileToDataUrl(file)
    expect(result).toMatch(/^data:text\/plain/)
  })
})

describe('downloadDataUrl', () => {
  it('does not throw when called with a valid data URL', () => {
    expect(() => downloadDataUrl('data:text/plain;base64,aGVsbG8=', 'hello.txt')).not.toThrow()
  })
})

describe('formatBytes', () => {
  it('formats bytes under 1 KB as "N B"', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats bytes in KB range', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1024 * 512)).toBe('512 KB')
  })

  it('formats bytes in MB range with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB')
  })
})
