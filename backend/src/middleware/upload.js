import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * Multipart handling for profile photos.
 *
 * Files are buffered in memory rather than written to a temp directory: they are capped at
 * 2 MB and go straight to the storage driver, so a temp file would only add a cleanup
 * path that can fail. Multer's own errors are translated into the standard
 * { error: { code, message, fields } } envelope here so the mobile form can attach the
 * message to the upload control and announce it.
 */

/** Human wording for the accepted types, reused in error copy and in docs. */
const TYPE_LABELS = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
};

export const allowedTypesLabel = env.upload.allowedMimeTypes
  .map((mime) => TYPE_LABELS[mime] ?? mime)
  .join(', ');

const maxMegabytes = Math.round((env.upload.maxBytes / (1024 * 1024)) * 10) / 10;

const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.upload.maxBytes,
    files: 1,
    // Generous but finite: keeps a malformed multipart body from growing unbounded.
    fields: 40,
    fieldSize: 100_000,
  },
  fileFilter(req, file, cb) {
    if (!env.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(
        ApiError.badRequest('UNSUPPORTED_FILE_TYPE', `Upload a ${allowedTypesLabel} file.`, {
          [file.fieldname]: `Must be ${allowedTypesLabel}`,
        }),
      );
      return;
    }
    cb(null, true);
  },
});

function translateMulterError(err, fieldName) {
  if (!(err instanceof multer.MulterError)) return err;

  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return ApiError.badRequest('FILE_TOO_LARGE', `File must be ${maxMegabytes} MB or smaller.`, {
        [err.field ?? fieldName]: `Maximum ${maxMegabytes} MB`,
      });
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return ApiError.badRequest('UNEXPECTED_FILE', `Attach a single file in the "${fieldName}" field.`, {
        [err.field ?? fieldName]: 'Only one file is allowed',
      });
    default:
      return ApiError.badRequest('UPLOAD_FAILED', 'That file could not be uploaded. Please try again.');
  }
}

/**
 * Accepts one optional file under `fieldName`.
 *
 * A request sent as plain JSON passes straight through (multer ignores non-multipart
 * bodies), so the same route handles "register with a photo" and "register without one"
 * without the client having to switch content types.
 */
export function optionalUpload(fieldName) {
  const handler = multerInstance.single(fieldName);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err) {
        next(translateMulterError(err, fieldName));
        return;
      }
      next();
    });
  };
}
