import { env } from '../../config/env.js';
import { localStorageDriver } from './localStorage.js';
import { s3StorageDriver } from './s3Storage.js';

/**
 * Pluggable file storage. Callers only ever see this interface:
 *
 *   save({ buffer, mimeType, originalName, folder })  ->  { key, url }
 *   remove(key)                                       ->  void  (best effort)
 *   keyFromUrl(url)                                   ->  string | null
 *
 * `key` is the storage-relative path we persist alongside the record; `url` is what the
 * clients fetch. Keeping both means a replaced photo can be deleted even though only the
 * URL is stored on DonorProfile.profilePhotoUrl.
 *
 * STORAGE_DRIVER picks the implementation: "local" writes to disk (development),
 * "s3" writes to any S3-compatible bucket (production). See docs/profiles.md.
 */

const drivers = {
  local: localStorageDriver,
  s3: s3StorageDriver,
};

const factory = drivers[env.storage.driver];

if (!factory) {
  throw new Error(
    `STORAGE_DRIVER="${env.storage.driver}" is not supported. Use one of: ${Object.keys(drivers).join(', ')}`,
  );
}

export const storage = factory();
