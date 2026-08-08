import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Extension chosen from the MIME type rather than the client's filename — an uploaded
 * "photo.php" must not keep that extension on disk, and the MIME type has already been
 * checked against the allow-list by the upload middleware.
 */
const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

export function extensionFor(mimeType, originalName = '') {
  const known = EXTENSION_BY_MIME[mimeType];
  if (known) return known;
  const fallback = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(fallback) ? fallback : '';
}

/**
 * Builds an unguessable key like `profiles/2026/9f3c…a1.jpg`.
 *
 * Deliberately NOT derived from the user id: profile photo URLs are handed to the CRM and
 * cached by clients, and an id-shaped path would let anyone holding one URL enumerate
 * other people's photos. 128 bits of randomness makes the key itself the capability.
 */
export function buildStorageKey({ folder = 'uploads', mimeType, originalName }) {
  const year = new Date().getUTCFullYear();
  const random = crypto.randomBytes(16).toString('hex');
  return `${folder}/${year}/${random}${extensionFor(mimeType, originalName)}`;
}
