/**
 * Every failure leaves the API as { error: { code, message, fields? } }.
 * `code` is a stable machine string the clients switch on; `message` is human text
 * safe to show a user; `fields` maps a form field name to its problem.
 */
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (fields) this.fields = fields;
  }

  static badRequest(code, message, fields) {
    return new ApiError(400, code, message, fields);
  }

  static unauthorized(code, message) {
    return new ApiError(401, code, message);
  }

  static forbidden(code, message) {
    return new ApiError(403, code, message);
  }

  static notFound(code, message) {
    return new ApiError(404, code, message);
  }

  // Takes `fields` because a conflict is usually about one input the user typed — an
  // email already in use should light up that input, not just show a banner.
  static conflict(code, message, fields) {
    return new ApiError(409, code, message, fields);
  }

  static tooManyRequests(code, message) {
    return new ApiError(429, code, message);
  }
}

/**
 * Express 4 does not forward rejections from async handlers, so every async route is
 * wrapped in this. (Express 5 makes it unnecessary; the wrapper is harmless there.)
 */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
