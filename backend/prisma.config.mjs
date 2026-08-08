// Prisma CLI configuration.
//
// Prisma 7 removed `url` from the datasource block in schema.prisma, so the connection
// string is supplied here instead. Written as .mjs rather than the default .ts because
// this project is plain JavaScript throughout — the Prisma CLI loads either.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
