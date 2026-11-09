import DOMPurify from 'dompurify'
import { marked } from 'marked'

/** Stories are written by anyone in the family, so the HTML is cleaned before it is shown. */
export function renderBio(bio: string) {
  return DOMPurify.sanitize(marked.parse(bio, { async: false, breaks: true }))
}
