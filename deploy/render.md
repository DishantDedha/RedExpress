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
| Keep-alive | GitHub Actions, every 10 min | £0 |

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
2. **GitHub → Settings → Secrets and variables → Actions → Variables**: add
   `API_BASE_URL` with the same value. That is what
   [`keepalive.yml`](../.github/workflows/keepalive.yml) pings.
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

**Cold starts if the keep-alive stops.** GitHub's scheduler runs late under load. If a 30–60
second wait ever appears in front of someone who matters, move the ping to UptimeRobot or
cron-job.org.

**750 instance-hours per month.** A single service running continuously uses ~720. There is no
room for a second always-on free service in the same workspace.

## Before real donors use this

- `SMS_PROVIDER=msg91` with a template id, and `OTP_MASTER_CODE` **removed** — the API refuses
  to boot with a sign-in bypass alive next to a real gateway
- `PUSH_PROVIDER=expo` with an EAS build and FCM credentials
- Backups. Neon's free tier keeps a short restore window; anything longer is your own dump
- A paid plan, or a move back to a server. Free tiers are for the phase before anyone is
  depending on this.
