import { ZodError } from 'zod';
import { ApiError } from '../utils/errors.js';

/**
 * Turns a zod schema into Express middleware and replaces req[source] with the parsed
 * (coerced, stripped) value, so controllers can trust their input.
 *
 * Zod issues become the `fields` map of the standard error envelope, which is exactly
 * what the mobile forms need to attach an inline, screen-reader-announced message to
 * the right input.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(ApiError.badRequest('VALIDATION_ERROR', 'Please check the highlighted fields.', fieldsFromZod(err)));
        return;
      }
      next(err);
    }
  };
}

export function fieldsFromZod(err) {
  const fields = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    // First message per field wins — a screen reader should hear one clear problem.
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
