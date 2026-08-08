import { env } from '../../config/env.js';
import { buildStorageKey } from './keys.js';

/**
 * Production driver for any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Spaces).
 *
 * `@aws-sdk/client-s3` is imported lazily and is NOT a declared dependency: development
 * runs on STORAGE_DRIVER=local and would otherwise pay ~20 MB of install for a code path
 * it never reaches. Deployments that set STORAGE_DRIVER=s3 install it explicitly —
 * docs/profiles.md and docs/deploy.md both say so, and the error below repeats it.
 */
export function s3StorageDriver() {
  const cfg = env.storage.s3;

  const missing = ['bucket', 'region', 'accessKeyId', 'secretAccessKey'].filter((key) => !cfg[key]);
  if (missing.length) {
    throw new Error(
      `STORAGE_DRIVER=s3 but these are not set: ${missing.map((k) => `S3_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(', ')}`,
    );
  }

  // Falls back to the standard AWS host when no custom endpoint (R2/MinIO) is configured.
  const publicBase = cfg.publicBaseUrl || `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const urlPrefix = `${publicBase}/`;

  let clientPromise = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = import('@aws-sdk/client-s3')
        .then((mod) => ({
          mod,
          client: new mod.S3Client({
            region: cfg.region,
            ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: true } : {}),
            credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
          }),
        }))
        .catch(() => {
          clientPromise = null;
          throw new Error(
            'STORAGE_DRIVER=s3 requires the AWS SDK. Install it in the backend workspace: npm install @aws-sdk/client-s3 --workspace backend',
          );
        });
    }
    return clientPromise;
  }

  return {
    name: 's3',

    async save({ buffer, mimeType, originalName, folder }) {
      const { mod, client } = await getClient();
      const key = buildStorageKey({ folder, mimeType, originalName });

      await client.send(
        new mod.PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          // A year: keys are random and never reused, so a cached copy can never go stale.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      return { key, url: `${urlPrefix}${key}` };
    },

    async remove(key) {
      if (!key) return;
      try {
        const { mod, client } = await getClient();
        await client.send(new mod.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
      } catch (err) {
        console.warn('[storage] could not delete', key, err.message);
      }
    },

    keyFromUrl(url) {
      if (typeof url !== 'string' || !url.startsWith(urlPrefix)) return null;
      return url.slice(urlPrefix.length);
    },
  };
}
