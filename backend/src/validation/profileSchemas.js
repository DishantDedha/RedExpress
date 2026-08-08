import { z } from 'zod';
import {
  bloodGroup,
  boolish,
  dateOfBirth,
  email,
  gender,
  lastDonationDate,
  latitude,
  longitude,
  optionalText,
  password,
  pincode,
  requiredText,
} from './common.js';

/**
 * Request shapes for /donors, /receivers and /me.
 *
 * These mirror the mockup forms field for field, and the messages are written to be read
 * aloud: the mobile client attaches each entry of the error envelope's `fields` map to
 * its input and announces the first one, so "Enter a valid 6 digit PIN code." has to make
 * sense with no visual context.
 */

/** Coordinates are all-or-nothing — one half of a position is worse than none. */
function requireBothCoordinates(schema) {
  return schema.refine(
    (data) => (data.latitude === undefined) === (data.longitude === undefined),
    { message: 'Send latitude and longitude together, or neither.', path: ['latitude'] },
  );
}

/** A password is only stored when it is confirmed. */
function requireMatchingConfirmation(schema) {
  return schema.refine((data) => !data.password || data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
}

const donorRegisterFields = {
  fullName: requiredText('your full name', { min: 2, max: 80 }),
  email,
  // Prefilled from the verified OTP session. Sent back by the form for confirmation; the
  // service rejects it if it disagrees with the number the token was issued for.
  phone: optionalText('a mobile number', { min: 8, max: 20 }),

  bloodGroup,
  gender,
  dateOfBirth: dateOfBirth.optional(),

  state: requiredText('your state', { max: 80 }),
  district: requiredText('your district', { max: 80 }),
  city: requiredText('your city', { max: 80 }),
  pincode,
  address: requiredText('your address', { min: 5, max: 500 }),

  // Sent when the donor granted the location permission; otherwise the address is
  // geocoded server-side.
  latitude: latitude.optional(),
  longitude: longitude.optional(),

  // App accounts sign in by OTP, so this is genuinely optional.
  password: password.optional(),
  confirmPassword: z.string().optional(),
};

export const donorRegisterSchema = requireMatchingConfirmation(
  requireBothCoordinates(z.object(donorRegisterFields)),
);

/**
 * Every field is optional here. The "you must change something" rule lives in
 * profileService instead, because a request whose only content is a replacement photo is
 * a valid update and the schema cannot see req.file.
 */
export const donorUpdateSchema = requireMatchingConfirmation(
  requireBothCoordinates(
    z
      .object({
        fullName: donorRegisterFields.fullName.optional(),
        email: email.optional(),
        bloodGroup: bloodGroup.optional(),
        gender: gender.optional(),
        dateOfBirth: dateOfBirth.optional(),
        state: donorRegisterFields.state.optional(),
        district: donorRegisterFields.district.optional(),
        city: donorRegisterFields.city.optional(),
        pincode: pincode.optional(),
        address: donorRegisterFields.address.optional(),
        latitude: latitude.optional(),
        longitude: longitude.optional(),
        isAvailable: boolish().optional(),
        password: password.optional(),
        confirmPassword: z.string().optional(),
        /// Send true to delete the current photo without uploading a replacement.
        removePhoto: boolish().optional(),
      }),
  ),
);

export const availabilitySchema = z.object({
  isAvailable: boolish('Choose whether you are available to donate.'),
});

export const lastDonationSchema = z.object({
  // null clears the date — "I have never donated" is a real answer, not a missing value.
  date: z.union([lastDonationDate, z.null()]),
});

/** The lighter receiver form: enough to route a request, nothing more. */
export const receiverRegisterSchema = requireBothCoordinates(
  z.object({
    fullName: requiredText('your full name', { min: 2, max: 80 }),
    state: requiredText('your state', { max: 80 }),
    district: requiredText('your district', { max: 80 }),
    city: optionalText('your city', { max: 80 }),
    email: email.optional(),
    phone: optionalText('a mobile number', { min: 8, max: 20 }),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
  }),
);
