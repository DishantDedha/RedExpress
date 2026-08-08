import { asyncHandler } from '../utils/errors.js';
import { searchDonors } from '../services/donorSearchService.js';

/**
 * GET /donors/search — the "Find Blood Donors" screen and, from Phase 6, the CRM.
 * Query parsing lives in donorSearchQuerySchema; the rules live in donorSearchService.
 */
export const searchDonorsHandler = asyncHandler(async (req, res) => {
  const result = await searchDonors(req.query, req.user);

  res.status(200).json({
    ...result,
    // One sentence the mobile screen can announce after a search, since a screen-reader
    // user gets no visual cue that the list under the button changed.
    message:
      result.total === 0
        ? 'No donors found. Try a wider area or a different blood group.'
        : `${result.total} ${result.total === 1 ? 'donor' : 'donors'} found.`,
  });
});
