import { describe, expect, test } from '@jest/globals';
import {
  NOTIFICATION_TYPES,
  buildAcceptedNotification,
  buildMatchNotification,
  distancePhrase,
  pushPriority,
} from '../src/services/pushMessages.js';

/**
 * These tests are mostly about words, which is unusual for a test file and deliberate:
 * the notification text is the product's only real-time channel and, for a blind donor,
 * it is heard rather than read. A regression here is not a cosmetic one — an emoji or an
 * ALL CAPS word turns an emergency alert into noise a screen reader mangles.
 */

const REQUEST = {
  id: 'req_1',
  bloodGroup: 'O_NEG',
  unitsNeeded: 2,
  hospitalName: 'Apollo Hospital',
  city: 'Bhubaneswar',
  district: 'Khordha',
  urgency: 'URGENT',
};

describe('distancePhrase', () => {
  test('spells out the unit rather than using "km"', () => {
    expect(distancePhrase(3.2)).toBe('about 3.2 kilometres away');
  });

  test('uses the singular at exactly one kilometre', () => {
    expect(distancePhrase(1)).toBe('about 1 kilometre away');
  });

  test('avoids a bare "0.4 kilometres" for very short distances', () => {
    expect(distancePhrase(0.4)).toBe('less than a kilometre away');
  });

  test('keeps one decimal under 10 km and whole numbers above it', () => {
    // The difference between 2.3 and 2.8 km is a different bus; 41.7 versus 42 is not.
    expect(distancePhrase(2.34)).toBe('about 2.3 kilometres away');
    expect(distancePhrase(41.7)).toBe('about 42 kilometres away');
  });

  test('returns null when there is no distance to state', () => {
    // Area-matched donors have no measured distance. Saying "0 kilometres away" would
    // send someone across the state believing they were around the corner.
    expect(distancePhrase(null)).toBeNull();
    expect(distancePhrase(undefined)).toBeNull();
    expect(distancePhrase(Number.NaN)).toBeNull();
  });
});

describe('buildMatchNotification', () => {
  const notification = buildMatchNotification({ request: REQUEST, distanceKm: 3.24, matchId: 'match_1' });

  test('leads with the urgency and the spoken blood group', () => {
    expect(notification.title).toBe('Urgent: O negative blood needed nearby');
  });

  test('never uses the short blood group form', () => {
    // "O-" is read as "O" or "O minus" depending on the screen reader.
    expect(`${notification.title} ${notification.body}`).not.toMatch(/O-|\bO\+/);
  });

  test('body carries the place, the distance and the units', () => {
    expect(notification.body).toBe('Apollo Hospital, Bhubaneswar, about 3.2 kilometres away. 2 units needed.');
  });

  test('data carries the ids the app deep-links with', () => {
    expect(notification.data).toMatchObject({
      type: NOTIFICATION_TYPES.REQUEST_MATCH,
      requestId: 'req_1',
      matchId: 'match_1',
      screen: 'request-detail',
    });
  });

  test('drops the urgency prefix for a NORMAL request', () => {
    const normal = buildMatchNotification({ request: { ...REQUEST, urgency: 'NORMAL' }, distanceKm: 5 });
    expect(normal.title).toBe('O negative blood needed nearby');
  });

  test('omits the distance clause when the donor was matched by area', () => {
    const areaMatched = buildMatchNotification({ request: REQUEST, distanceKm: null });
    expect(areaMatched.body).toBe('Apollo Hospital, Bhubaneswar. 2 units needed.');
    expect(areaMatched.body).not.toMatch(/kilometre/);
  });

  test('falls back to the district when no city is stored', () => {
    const noCity = buildMatchNotification({ request: { ...REQUEST, city: null }, distanceKm: 3 });
    expect(noCity.body).toContain('Apollo Hospital, Khordha');
  });

  test('uses the singular for a single unit', () => {
    const oneUnit = buildMatchNotification({ request: { ...REQUEST, unitsNeeded: 1 }, distanceKm: 3 });
    expect(oneUnit.body).toContain('1 unit needed');
  });

  test('contains no emoji and no shouted words', () => {
    for (const urgency of ['NORMAL', 'URGENT', 'CRITICAL']) {
      const text = (({ title, body }) => `${title} ${body}`)(
        buildMatchNotification({ request: { ...REQUEST, urgency }, distanceKm: 3 }),
      );
      // Anything outside plain ASCII punctuation/letters would be an emoji or a symbol a
      // screen reader has to guess at.
      expect(text).toMatch(/^[\w\s.,:'-]+$/);
      // No run of two or more capitals: "URGENT" is spelled out letter by letter.
      expect(text).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe('pushPriority', () => {
  test('wakes the phone only for genuinely urgent requests', () => {
    expect(pushPriority('CRITICAL')).toBe('high');
    expect(pushPriority('URGENT')).toBe('high');
    expect(pushPriority('NORMAL')).toBe('default');
  });
});

describe('buildAcceptedNotification', () => {
  test('names the donor, because "someone accepted" is not actionable', () => {
    const notification = buildAcceptedNotification({
      request: REQUEST,
      donorName: 'Sunita Patra',
      distanceKm: 2,
    });
    expect(notification.title).toBe('Sunita Patra can donate');
    expect(notification.body).toBe(
      'Sunita Patra accepted your O negative blood request and is about 2 kilometres away. Open the request to see their number.',
    );
    expect(notification.data.requestId).toBe('req_1');
  });

  test('reads as a sentence when there is no distance', () => {
    const notification = buildAcceptedNotification({ request: REQUEST, donorName: 'Sunita Patra' });
    expect(notification.body).toBe(
      'Sunita Patra accepted your O negative blood request. Open the request to see their number.',
    );
  });
});
