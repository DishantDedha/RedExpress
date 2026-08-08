import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';

/**
 * Two checks, because platforms ask two different questions.
 *
 *   GET /health   Liveness. "Is this process still running?" Answers from memory, touches
 *                 nothing external, and must never fail for a reason outside the process —
 *                 a liveness probe that fails when the database blips gets the container
 *                 killed and restarted, which does not fix a database.
 *
 *   GET /health/ready  Readiness. "Should traffic be sent here?" Actually reaches the
 *                 database, because a Node process that cannot reach Postgres can serve
 *                 nothing but errors and should be taken out of the load balancer until
 *                 it can.
 *
 * Neither is authenticated — a probe cannot hold a token — so neither returns anything a
 * stranger should not see: no version string, no connection details, no row counts.
 */

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'red-express-backend',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (req, res) => {
  const startedQueryAt = Date.now();

  try {
    // The cheapest possible round-trip: proves the pool can hand out a live connection
    // without reading a single row of anyone's data.
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ready',
      database: { status: 'up', latencyMs: Date.now() - startedQueryAt },
      time: new Date().toISOString(),
    });
  } catch (error) {
    // 503, not 500: this is "not yet", and a load balancer treats it as retryable.
    // The reason is logged, never returned — a connection error carries the database
    // host, and sometimes the credentials, in its message.
    console.error('[health] readiness check failed:', error.message);

    res.status(503).json({
      status: 'unavailable',
      database: { status: 'down' },
      ...(env.isProduction ? {} : { detail: error.message }),
      time: new Date().toISOString(),
    });
  }
});
