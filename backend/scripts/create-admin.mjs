import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/prisma.js';

/**
 * Creates the first ADMIN on a production database.
 *
 * `npm run db:seed` must never be run against production — it inserts thirty fictional donors
 * with real-looking Odisha coordinates, and a staff member ringing one of those numbers during
 * an emergency is the kind of mistake that only surfaces at the worst moment. This script is
 * the production alternative: one account, nothing else.
 *
 *   npm run create:admin --workspace backend
 *   npm run create:admin --workspace backend -- --email ops@example.org --name "Ops Lead"
 *
 * The password is read from stdin, never from an argument. A password on the command line is
 * written to shell history, is visible in `ps` to every user on the box, and is captured by
 * most process-monitoring agents. Set ADMIN_PASSWORD in the environment for an unattended run
 * — one deliberate exception, for CI and first-boot scripts.
 *
 * Re-runnable: an existing account with the same email is promoted to ADMIN and its password
 * reset, which also makes this the recovery path when the only admin password is lost.
 */

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

/**
 * Prompts on the terminal.
 *
 * With `silent`, the echo is suppressed so the password does not sit on screen — or in a
 * screen-share, or a terminal scrollback, or a recording of the deploy.
 *
 * The suppression works by swapping `stdout.write` for the duration of the question and
 * putting the original back in a `finally`. Restoring it is not optional housekeeping:
 * `stdout` is a process-wide singleton, so a swap that is never undone silences every
 * `console.log` for the rest of the run — including the line that says whether the admin was
 * created.
 */
async function ask(prompt, { silent = false } = {}) {
  if (!stdin.isTTY) {
    fail(
      `Cannot prompt for "${prompt.trim()}" — this is not an interactive terminal.\n` +
        'Pass --email and --name, and set ADMIN_PASSWORD in the environment.',
    );
  }

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  if (!silent) {
    try {
      return (await rl.question(prompt)).trim();
    } finally {
      rl.close();
    }
  }

  const originalWrite = stdout.write.bind(stdout);
  stdout.write = () => true;

  try {
    originalWrite(prompt);
    const answer = await rl.question('');
    originalWrite('\n');
    return answer.trim();
  } finally {
    stdout.write = originalWrite;
    rl.close();
  }
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? (await ask('Admin email: '))).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not an email address.`);

const name = arg('name') ?? process.env.ADMIN_NAME ?? (await ask('Full name: ')) ?? 'Administrator';

const password = process.env.ADMIN_PASSWORD ?? (await ask('Password (hidden): ', { silent: true }));

// Twelve rather than the eight a user-facing form might accept: this account can reactivate a
// donor, read every phone number in the database, and create more administrators.
if (!password || password.length < 12) {
  fail('The admin password must be at least 12 characters.');
}

const existing = await prisma.user.findUnique({ where: { email } });

const user = await prisma.user.upsert({
  where: { email },
  create: {
    email,
    name,
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordHash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12)),
  },
  update: {
    name,
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordHash: await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12)),
    // Any session the old password holder had is dead the moment this runs — which is the
    // point when this is being used to recover a compromised or forgotten account.
    tokenVersion: { increment: 1 },
  },
});

console.log(
  `\n${existing ? 'Updated' : 'Created'} ADMIN ${user.email} (${user.name}).` +
    `\nSign in at the CRM. Change nothing else here — further staff are added from the dashboard.\n`,
);

await prisma.$disconnect();
