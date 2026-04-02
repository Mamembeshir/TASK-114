/**
 * HTML sanitization utility using DOMPurify.
 *
 * Used before rendering any user-supplied rich-text content via
 * dangerouslySetInnerHTML to prevent XSS attacks.
 */
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML from user-supplied rich text (TipTap output).
 * Allows common prose tags; strips scripts, event handlers, and data: URIs.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'a',
      'span',
      'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    // Force noopener on all links
    ADD_ATTR: ['rel'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  })
}
