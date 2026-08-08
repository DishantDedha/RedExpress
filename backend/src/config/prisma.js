import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 connects through a driver adapter rather than a URL baked into the schema,
// so the connection string is read here and handed to node-postgres.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy the [backend] section of .env.example into backend/.env');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Each PrismaClient opens its own connection pool. `node --watch` re-imports modules on
// every save, so the instance is cached on globalThis in development to avoid leaking pools.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__redExpressPrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__redExpressPrisma = prisma;
}
