import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { buildStorageKey } from './keys.js';

/**
 * Development driver: writes under STORAGE_LOCAL_DIR and serves the directory from
 * `${API_BASE_URL}/uploads` (app.js mounts express.static for exactly this driver).
 *
 * Not intended for production — a container filesystem is not durable and does not scale
 * past one instance. Set STORAGE_DRIVER=s3 there.
 */
export function localStorageDriver() {
  const root = path.resolve(process.cwd(), env.storage.localDir);
  const publicPath = env.storage.localPublicPath;
  const urlPrefix = `${env.apiBaseUrl}${publicPath}/`;

  /** Resolves a key to an absolute path, refusing anything that escapes the root. */
  function resolveKey(key) {
    const target = path.resolve(root, key);
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (!target.startsWith(rootWithSep)) {
      throw new Error(`Refusing to touch "${key}": resolves outside the storage root.`);
    }
    return target;
  }

  return {
    name: 'local',
    /** Absolute directory app.js hands to express.static. */
    root,
    publicPath,

    async save({ buffer, mimeType, originalName, folder }) {
      const key = buildStorageKey({ folder, mimeType, originalName });
      const target = resolveKey(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
      return { key, url: `${urlPrefix}${key}` };
    },

    async remove(key) {
      if (!key) return;
      // Best effort: a missing old photo must never fail the update that replaced it.
      await fs.rm(resolveKey(key), { force: true }).catch((err) => {
        console.warn('[storage] could not delete', key, err.message);
      });
    },

    keyFromUrl(url) {
      if (typeof url !== 'string') return null;
      if (url.startsWith(urlPrefix)) return url.slice(urlPrefix.length);
      // Tolerates a stored URL from a different host (e.g. the API moved) as long as the
      // /uploads/ path segment is intact.
      const marker = `${publicPath}/`;
      const at = url.indexOf(marker);
      return at === -1 ? null : url.slice(at + marker.length);
    },
  };
}
