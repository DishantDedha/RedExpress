# Deploying to Render + Neon

The free-hosting path: the API on Render, PostgreSQL on Neon. For the single-EC2 setup see
[`README.md`](README.md) in this folder — the two are alternatives, not steps.

**Why the database is not Render's.** Render's free Postgres is deleted 30 days after creation
(14-day grace, then the data is gone). Neon's free tier does not expire. Since this codebase
uses plain PostgreSQL with no extensions — no PostGIS, deliberately — it moves between the two
without a schema change.

| Piece | Where | Cost |
|---|---|---|
| API | Render free web service, Singapore | £0 |
| Database | Neon free tier | £0 |

**Cold starts are accepted here.** A free Render service sleeps after 15 minutes idle and takes
30–60 seconds to answer the request that wakes it. Keeping it warm is possible — a ping every
ten minutes costs about 720 of the 750 free instance-hours — but it was judged not worth the
allowance during testing. If a cold start ever turns up in front of someone who matters, point
UptimeRobot or cron-job.org at `/health/ready` and it goes away.

---

## 1. Neon

1. [neon.tech](https://neon.tech) → sign up → **Create project**
2. Region: **AWS ap-southeast-1 (Singapore)** — same region as the Render service, so the
   round trip between them is a few milliseconds rather than a few hundred
3. Copy the **connection string**. It looks like:

```
postgresql://USER:PASSWORD@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Keep `?sslmode=require`. Neon refuses unencrypted connections, and the driver adapter honours it.

Nothing else to configure. The schema is created by the migration step in §3.

## 2. Secrets

Generate these locally — they should not exist anywhere before you paste them into Render:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(String(Math.floor(Math.random()*1e6)).padStart(6,'0'))"  # OTP_MASTER_CODE
```

The two JWT secrets must differ. Sharing one makes a leaked access token good for thirty days
rather than fifteen minutes.

## 3. Render

**New → Blueprint**, point it at this repository. Render reads [`render.yaml`](../render.yaml)
and prompts for the values marked `sync: false`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `JWT_ACCESS_SECRET` | from §2 |
| `JWT_REFRESH_SECRET` | from §2 |
| `OTP_MASTER_CODE` | from §2 — the demo sign-in code |
| `API_BASE_URL` | leave blank for now; §4 fills it in |

The build runs `db:deploy`, which applies the committed migrations to Neon. An unreachable
database therefore fails the build rather than producing a service that boots and then 503s on
every request.

## 4. Once it is live

Render assigns a hostname like `redexpress-api.onrender.com`.

1. **Settings → Environment**: set `API_BASE_URL` to `https://<that host>` and redeploy.
   Uploaded files are handed to clients as absolute URLs built from it.
2. **Vercel → Environment Variables**: point `BACKEND_API_BASE_URL` at the same host and
   redeploy the CRM.
3. Create the one real administrator. Render's shell is on paid plans, so run it locally
   against the Neon database:

```bash
cd backend
DATABASE_URL='<neon connection string>' \
ADMIN_EMAIL=you@example.com ADMIN_NAME="Ops Lead" ADMIN_PASSWORD='…' \
  npm run create:admin
```

**Never run `db:seed` against this database.** It inserts thirty fictional donors with
real-looking Odisha phone numbers, and staff would ring them during an emergency.

## 5. Verify

```bash
curl https://<host>/health/ready     # {"status":"ready","database":{"status":"up",…}}
curl -I https://<host>/health        # 200, and TLS terminated by Render
```

Then sign in to the CRM and open a donor record — that exercises Vercel → Render → Neon in one
action.

---

## What this setup does not give you

**Uploads do not survive a deploy.** Render free has no persistent disk, so with
`STORAGE_DRIVER=local` every profile photo is lost on each redeploy. Tolerable for a prototype;
the fix is `STORAGE_DRIVER=s3` with an `ap-south-1` bucket and the four `S3_*` variables, plus
`npm install @aws-sdk/client-s3 --workspace backend` — the driver imports it lazily and does
not declare it.

**No static outbound IP.** MSG91's auth-key IP allow-list cannot be used, because Render's
egress address is not fixed on the free plan. Create that key with IP Security **off**, keep it
out of screenshots, and rotate it if it is ever exposed.

**Cold starts.** The service sleeps after 15 minutes idle and takes 30–60 seconds to answer the
request that wakes it. Accepted deliberately here. If it ever appears in front of someone who
matters, point UptimeRobot or cron-job.org at `/health/ready`.

**750 instance-hours per month, shared across the whole workspace.** Sleeping services consume
none, so this is not a constraint while nothing is kept warm — but it becomes one the moment
anything runs continuously, and it is counted per workspace rather than per service.

## Before real donors use this

- `SMS_PROVIDER=msg91` with a template id, and `OTP_MASTER_CODE` **removed** — the API refuses
  to boot with a sign-in bypass alive next to a real gateway
- `PUSH_PROVIDER=expo` with an EAS build and FCM credentials
- Backups. Neon's free tier keeps a short restore window; anything longer is your own dump
- A paid plan, or a move back to a server. Free tiers are for the phase before anyone is
  depending on this.
