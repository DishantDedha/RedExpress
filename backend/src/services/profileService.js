import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { ageInYears } from '../validation/common.js';
import { resolveCoordinates } from './locationService.js';
import { storage } from './storage/index.js';

/**
 * Registration and profile use-cases for app users.
 *
 * The Phase 2 OTP flow creates a bare User row (verified phone, no name); this module is
 * what turns that row into a usable donor or receiver. Every entry point therefore
 * assumes an authenticated, phone-verified caller and works on `req.user`.
 */

// ---------------------------------------------------------------------------
// Views — the only shapes that leave the service
// ---------------------------------------------------------------------------

/** The signed-in user's own record. Never includes passwordHash or tokenVersion. */
export function userView(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    status: user.status,
    isPhoneVerified: user.isPhoneVerified,
    hasPassword: Boolean(user.passwordHash),
    state: user.state,
    district: user.district,
    city: user.city,
    latitude: user.latitude,
    longitude: user.longitude,
    createdAt: user.createdAt,
  };
}

/**
 * A donor's own profile. Full address and coordinates are included because this is only
 * ever the caller's own record — the search results other donors see carry a distance and
 * no street address (Phase 4 / Phase 15).
 */
export function donorProfileView(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.userId,
    bloodGroup: profile.bloodGroup,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    age: profile.dateOfBirth ? ageInYears(profile.dateOfBirth) : null,
    lastDonationDate: profile.lastDonationDate,
    isAvailable: profile.isAvailable,
    state: profile.state,
    district: profile.district,
    city: profile.city,
    pincode: profile.pincode,
    address: profile.address,
    profilePhotoUrl: profile.profilePhotoUrl,
    latitude: profile.latitude,
    longitude: profile.longitude,
    hasLocation: profile.latitude !== null && profile.longitude !== null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

/** Uniform envelope for every profile endpoint, so clients need one parser. */
function profilePayload(user, donorProfile, extra = {}) {
  return { user: userView(user), donorProfile: donorProfileView(donorProfile), ...extra };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Staff belong to the CRM; they have no donor profile and no phone-verified session. */
function assertAppUser(user) {
  if (user.role === 'STAFF' || user.role === 'ADMIN') {
    throw ApiError.forbidden(
      'APP_ACCOUNT_REQUIRED',
      'Staff accounts cannot register as donors or receivers.',
    );
  }
  if (!user.isPhoneVerified) {
    throw ApiError.forbidden('PHONE_NOT_VERIFIED', 'Verify your mobile number before continuing.');
  }
}

/**
 * The form prefills the phone from the OTP session, so a mismatch means the client sent
 * the wrong session or the user edited a field they should not have. Changing the phone
 * number requires re-verifying it, which is a separate flow.
 */
function assertPhoneMatches(user, submittedPhone) {
  if (!submittedPhone) return;
  const normalized = normalizePhone(submittedPhone);
  if (normalized !== user.phone) {
    throw ApiError.badRequest(
      'PHONE_MISMATCH',
      'That mobile number does not match the one you verified. Verify the new number instead.',
      { phone: 'Does not match your verified number' },
    );
  }
}

/**
 * Prisma's unique-constraint violation, mapped onto the field the user actually typed.
 *
 * Prisma 7 talks to Postgres through a driver adapter, which does NOT populate
 * `meta.target` the way the old engine did — the offending column only appears in the
 * message ("Unique constraint failed on the fields: (`email`)"). Both are checked so this
 * keeps working if that changes back.
 */
function rethrowUniqueViolation(err) {
  if (err?.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target ?? '');
    const offendingColumn = `${target} ${err.message ?? ''}`.toLowerCase();

    if (offendingColumn.includes('email')) {
      throw ApiError.conflict('EMAIL_IN_USE', 'That email address is already registered.', {
        email: 'Already registered',
      });
    }
    if (offendingColumn.includes('phone')) {
      throw ApiError.conflict('PHONE_IN_USE', 'That mobile number is already registered.', {
        phone: 'Already registered',
      });
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Location + photo helpers
// ---------------------------------------------------------------------------

async function storeProfilePhoto(file) {
  if (!file) return null;
  return storage.save({
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    folder: 'profiles',
  });
}

/** Best-effort delete of a replaced photo; never allowed to fail the request. */
async function discardPhoto(url) {
  const key = url ? storage.keyFromUrl(url) : null;
  if (key) await storage.remove(key);
}

async function hashIfPresent(password) {
  return password ? bcrypt.hash(password, env.bcryptRounds) : undefined;
}

// ---------------------------------------------------------------------------
// Donor
// ---------------------------------------------------------------------------

export async function registerDonor(user, input, file) {
  assertAppUser(user);
  assertPhoneMatches(user, input.phone);

  const existingProfile = await prisma.donorProfile.findUnique({ where: { userId: user.id } });
  if (existingProfile) {
    throw ApiError.conflict(
      'PROFILE_EXISTS',
      'You are already registered as a donor. Edit your profile instead.',
    );
  }

  const location = await resolveCoordinates(input);
  const photo = await storeProfilePhoto(file);
  const passwordHash = await hashIfPresent(input.password);

  try {
    // One transaction: a user promoted to DONOR without a profile row would fail every
    // later read, and a profile without the role would never appear in search.
    const [updatedUser, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          name: input.fullName,
          email: input.email,
          role: 'DONOR',
          ...(passwordHash ? { passwordHash } : {}),
          // The donor's authoritative location lives on the profile, so the coarse
          // columns used for receivers are cleared to keep one source of truth.
          state: null,
          district: null,
          city: null,
          latitude: null,
          longitude: null,
        },
      }),
      prisma.donorProfile.create({
        data: {
          userId: user.id,
          bloodGroup: input.bloodGroup,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth ?? null,
          state: input.state,
          district: input.district,
          city: input.city,
          pincode: input.pincode,
          address: input.address,
          profilePhotoUrl: photo?.url ?? null,
          latitude: location.latitude,
          longitude: location.longitude,
        },
      }),
    ]);

    return profilePayload(updatedUser, profile, { locationSource: location.locationSource });
  } catch (err) {
    // Nothing references the uploaded file yet, so it would be a permanent orphan.
    await discardPhoto(photo?.url);
    rethrowUniqueViolation(err);
  }
}

export async function getDonorProfile(user) {
  const profile = await prisma.donorProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    throw ApiError.notFound('PROFILE_NOT_FOUND', 'You have not registered as a donor yet.');
  }
  return profilePayload(user, profile);
}

export async function updateDonorProfile(user, input, file) {
  assertAppUser(user);

  // A PATCH carrying nothing is a client bug worth surfacing rather than a silent 200.
  // Checked here rather than in the schema because a body whose only content is a
  // replacement photo is a perfectly valid update, and zod never sees the file.
  if (!file && Object.keys(input).length === 0) {
    throw ApiError.badRequest('NOTHING_TO_UPDATE', 'Send at least one field to update.');
  }

  const current = await prisma.donorProfile.findUnique({ where: { userId: user.id } });
  if (!current) {
    throw ApiError.notFound('PROFILE_NOT_FOUND', 'You have not registered as a donor yet.');
  }

  const userData = {};
  if (input.fullName !== undefined) userData.name = input.fullName;
  if (input.email !== undefined) userData.email = input.email;
  const passwordHash = await hashIfPresent(input.password);
  if (passwordHash) userData.passwordHash = passwordHash;

  const profileData = {};
  for (const field of ['bloodGroup', 'gender', 'state', 'district', 'city', 'pincode', 'address', 'isAvailable']) {
    if (input[field] !== undefined) profileData[field] = input[field];
  }
  if (input.dateOfBirth !== undefined) profileData.dateOfBirth = input.dateOfBirth;

  // Coordinates follow the address: an explicit lat/lng always wins, but a donor who
  // moves and only retypes their address should not keep the old position.
  let locationSource = 'unchanged';
  if (input.latitude !== undefined && input.longitude !== undefined) {
    profileData.latitude = input.latitude;
    profileData.longitude = input.longitude;
    locationSource = 'device';
  } else if (['address', 'city', 'district', 'state', 'pincode'].some((field) => input[field] !== undefined)) {
    const resolved = await resolveCoordinates({ ...current, ...profileData, latitude: undefined, longitude: undefined });
    if (resolved.latitude !== null) {
      profileData.latitude = resolved.latitude;
      profileData.longitude = resolved.longitude;
      locationSource = resolved.locationSource;
    }
  }

  const photo = await storeProfilePhoto(file);
  if (photo) {
    profileData.profilePhotoUrl = photo.url;
  } else if (input.removePhoto) {
    profileData.profilePhotoUrl = null;
  }

  try {
    const [updatedUser, profile] = await prisma.$transaction([
      Object.keys(userData).length
        ? prisma.user.update({ where: { id: user.id }, data: userData })
        : prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      Object.keys(profileData).length
        ? prisma.donorProfile.update({ where: { userId: user.id }, data: profileData })
        : prisma.donorProfile.findUniqueOrThrow({ where: { userId: user.id } }),
    ]);

    // Only once the new URL is committed — otherwise a failed update would leave the
    // record pointing at a file that no longer exists.
    if ((photo || input.removePhoto) && current.profilePhotoUrl) {
      await discardPhoto(current.profilePhotoUrl);
    }

    return profilePayload(updatedUser, profile, { locationSource });
  } catch (err) {
    await discardPhoto(photo?.url);
    rethrowUniqueViolation(err);
  }
}

export async function setDonorAvailability(user, isAvailable) {
  const profile = await prisma.donorProfile
    .update({ where: { userId: user.id }, data: { isAvailable } })
    .catch((err) => {
      if (err?.code === 'P2025') {
        throw ApiError.notFound('PROFILE_NOT_FOUND', 'You have not registered as a donor yet.');
      }
      throw err;
    });

  return profilePayload(user, profile, {
    // Plain sentence rather than a status flag: the mobile screen announces this verbatim.
    message: isAvailable
      ? 'You are now shown as available to donate.'
      : 'You are now shown as not available to donate.',
  });
}

export async function setLastDonationDate(user, date) {
  const profile = await prisma.donorProfile
    .update({ where: { userId: user.id }, data: { lastDonationDate: date } })
    .catch((err) => {
      if (err?.code === 'P2025') {
        throw ApiError.notFound('PROFILE_NOT_FOUND', 'You have not registered as a donor yet.');
      }
      throw err;
    });

  return profilePayload(user, profile, {
    message: date ? 'Last donation date updated.' : 'Last donation date cleared.',
  });
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

/**
 * The quick receiver form. Location lives on the User row here — a receiver has no
 * DonorProfile, and state/district is enough to route a request.
 *
 * An existing DONOR who fills this in keeps their DONOR role: donors need blood too, and
 * demoting them would silently drop them out of every search.
 */
export async function registerReceiver(user, input) {
  assertAppUser(user);
  assertPhoneMatches(user, input.phone);

  const hasDonorProfile = Boolean(await prisma.donorProfile.findUnique({ where: { userId: user.id } }));

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.fullName,
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(hasDonorProfile ? {} : { role: 'RECEIVER' }),
        state: input.state,
        district: input.district,
        city: input.city ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      },
    });

    return {
      user: userView(updated),
      donorProfile: null,
      locationSource: input.latitude !== undefined ? 'device' : 'none',
    };
  } catch (err) {
    rethrowUniqueViolation(err);
  }
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Whoever is signed in, whatever their role — the app's "who am I" call. */
export async function getMe(user) {
  const donorProfile =
    user.role === 'DONOR' ? await prisma.donorProfile.findUnique({ where: { userId: user.id } }) : null;

  return profilePayload(user, donorProfile, {
    // Lets the app decide between the home screen and the registration form without a
    // second round trip. Mirrors the same flag returned by /auth/otp/verify.
    profileComplete: Boolean(user.name) && (user.role !== 'DONOR' || Boolean(donorProfile)),
  });
}
