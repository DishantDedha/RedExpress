/**
 * Red Express — development seed data.
 *
 *   1 ADMIN, 2 STAFF, 30 DONORs across eight Odisha districts, 3 RECEIVERs.
 *
 * Idempotent: every row is upserted on a natural key (email or phone), so running
 * `npm run db:seed` repeatedly converges on the same dataset instead of duplicating it.
 *
 * Coordinates are deterministic — a fixed-seed PRNG scatters donors within roughly 6 km
 * of each district centre. That spread is deliberate: it gives the Phase 4 radius
 * expansion (5 → 10 → 25 → 50 km) something realistic to walk through.
 *
 * Run with: npm run db:seed --workspace backend
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

// --- deterministic randomness ------------------------------------------------
// Fixed seed so re-running produces identical coordinates and ages.
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250805);

/** Random offset in degrees, roughly +/- `km` at Odisha's latitude. */
function jitter(km) {
  return (rand() * 2 - 1) * (km / 111);
}

// --- reference data ----------------------------------------------------------

const STATE = 'Odisha';

/** District centres. lat/lng are the real city centres; donors are scattered around them. */
const DISTRICTS = [
  { district: 'Khordha', city: 'Bhubaneswar', pincode: '751001', lat: 20.2961, lng: 85.8245 },
  { district: 'Cuttack', city: 'Cuttack', pincode: '753001', lat: 20.4625, lng: 85.8828 },
  { district: 'Puri', city: 'Puri', pincode: '752001', lat: 19.8135, lng: 85.8312 },
  { district: 'Ganjam', city: 'Berhampur', pincode: '760001', lat: 19.3150, lng: 84.7941 },
  { district: 'Sundargarh', city: 'Rourkela', pincode: '769001', lat: 22.2604, lng: 84.8536 },
  { district: 'Sambalpur', city: 'Sambalpur', pincode: '768001', lat: 21.4669, lng: 83.9812 },
  { district: 'Balasore', city: 'Balasore', pincode: '756001', lat: 21.4934, lng: 86.9335 },
  { district: 'Angul', city: 'Angul', pincode: '759122', lat: 20.8400, lng: 85.1017 },
];

const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG'];

const DONOR_NAMES = [
  'Sradha Mohanty', 'Biswajit Sahoo', 'Ananya Panda', 'Rakesh Behera', 'Priyanka Nayak',
  'Subrat Das', 'Lipsa Jena', 'Manoj Pradhan', 'Sasmita Rout', 'Debasish Mishra',
  'Itishree Swain', 'Chinmaya Patra', 'Sunita Barik', 'Amit Mahapatra', 'Puja Sahu',
  'Ranjan Tripathy', 'Madhusmita Dash', 'Sanjay Parida', 'Bhagyashree Sethi', 'Tapas Mohapatra',
  'Jyotsna Bhoi', 'Prakash Naik', 'Snehalata Kar', 'Rabindra Samal', 'Namita Pati',
  'Gyana Ranjan Sahu', 'Aparajita Mallick', 'Susanta Bal', 'Rashmita Muduli', 'Alok Senapati',
];

const RECEIVER_NAMES = ['Kailash Meher', 'Sarita Pattnaik', 'Deepak Routray'];

// --- helpers -----------------------------------------------------------------

/** Birth date for a given age, deterministic within the year. */
function birthDateForAge(age, dayOffset) {
  const d = new Date(Date.UTC(2026 - age, (dayOffset * 37) % 12, ((dayOffset * 13) % 27) + 1));
  return d;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// --- seeding -----------------------------------------------------------------

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@redexpress.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-before-production';
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name: 'Red Express Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash },
    create: { email, name: 'Red Express Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash },
  });

  console.log(`  ADMIN    ${admin.email}`);
  return admin;
}

async function seedStaff() {
  const password = process.env.SEED_STAFF_PASSWORD ?? 'change-me-before-production';
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const staffSeeds = [
    { email: 'staff1@redexpress.local', name: 'Ritu Acharya' },
    { email: 'staff2@redexpress.local', name: 'Pravat Kumar Sahoo' },
  ];

  const staff = [];
  for (const s of staffSeeds) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { name: s.name, role: 'STAFF', status: 'ACTIVE', passwordHash },
      create: { email: s.email, name: s.name, role: 'STAFF', status: 'ACTIVE', passwordHash },
    });
    console.log(`  STAFF    ${user.email}`);
    staff.push(user);
  }
  return staff;
}

async function seedDonors() {
  const donors = [];

  for (let i = 0; i < DONOR_NAMES.length; i += 1) {
    const name = DONOR_NAMES[i];
    const place = DISTRICTS[i % DISTRICTS.length];
    // Both lists have eight entries, so a plain `i % 8` would give every donor in a
    // district the same blood group — and then a search for B+ near Bhubaneswar would
    // find nobody for reasons that have nothing to do with the code. Adding the lap
    // number decorrelates the two cycles while staying fully deterministic.
    const bloodGroup =
      BLOOD_GROUPS[(i + Math.floor(i / DISTRICTS.length)) % BLOOD_GROUPS.length];
    const phone = `+9190000${String(i + 1).padStart(5, '0')}`;

    // Two donors are seeded in non-ACTIVE states so the Phase 4 search filters and the
    // Phase 6 CRM lifecycle have something to exercise straight away.
    let status = 'ACTIVE';
    if (i === 7) status = 'DEAD';
    if (i === 19) status = 'BLOCKED';

    // A quarter of donors are marked unavailable — exercises `availableOnly`.
    const isAvailable = status === 'ACTIVE' && i % 4 !== 3;

    const user = await prisma.user.upsert({
      where: { phone },
      update: { name, role: 'DONOR', status, isPhoneVerified: true },
      create: { phone, name, role: 'DONOR', status, isPhoneVerified: true },
    });

    const profile = {
      bloodGroup,
      gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
      dateOfBirth: birthDateForAge(20 + (i % 26), i),
      // Roughly half have donated before; 90-day eligibility logic can use this later.
      lastDonationDate: i % 2 === 0 ? daysAgo(30 + ((i * 17) % 300)) : null,
      isAvailable,
      state: STATE,
      district: place.district,
      city: place.city,
      pincode: place.pincode,
      address: `${(i % 90) + 1}, Sector ${(i % 12) + 1}, ${place.city}`,
      profilePhotoUrl: null,
      latitude: Number((place.lat + jitter(6)).toFixed(6)),
      longitude: Number((place.lng + jitter(6)).toFixed(6)),
    };

    await prisma.donorProfile.upsert({
      where: { userId: user.id },
      update: profile,
      create: { userId: user.id, ...profile },
    });

    donors.push(user);
  }

  console.log(`  DONOR    ${donors.length} donors across ${DISTRICTS.length} districts`);
  return donors;
}

async function seedReceivers() {
  const receivers = [];

  for (let i = 0; i < RECEIVER_NAMES.length; i += 1) {
    const place = DISTRICTS[i % DISTRICTS.length];
    const phone = `+9191000${String(i + 1).padStart(5, '0')}`;

    // Receivers have no DonorProfile, so their coarse location lives on the User row —
    // the same columns POST /receivers/register writes (Phase 3).
    const location = {
      state: STATE,
      district: place.district,
      city: place.city,
      latitude: Number((place.lat + jitter(3)).toFixed(6)),
      longitude: Number((place.lng + jitter(3)).toFixed(6)),
    };

    const user = await prisma.user.upsert({
      where: { phone },
      update: { name: RECEIVER_NAMES[i], role: 'RECEIVER', status: 'ACTIVE', isPhoneVerified: true, ...location },
      create: {
        phone,
        name: RECEIVER_NAMES[i],
        role: 'RECEIVER',
        status: 'ACTIVE',
        isPhoneVerified: true,
        ...location,
      },
    });

    console.log(`  RECEIVER ${user.phone}  ${user.name}  (${place.city})`);
    receivers.push(user);
  }

  return receivers;
}

async function main() {
  console.log('Seeding Red Express…\n');

  await seedAdmin();
  await seedStaff();
  await seedDonors();
  await seedReceivers();

  const counts = await prisma.user.groupBy({ by: ['role'], _count: { _all: true } });
  console.log('\nUsers by role:');
  for (const row of counts) {
    console.log(`  ${row.role.padEnd(9)} ${row._count._all}`);
  }

  console.log('\nStaff sign-in uses SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env.');
  console.log('Change those before this ever runs anywhere but your laptop.');
  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
