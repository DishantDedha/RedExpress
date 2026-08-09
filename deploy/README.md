# Deploying Red Express to one EC2 instance

The runbook for the single-box setup: backend, CRM and PostgreSQL on one Ubuntu 24.04
instance, nginx in front, photos in S3. [`../docs/deploy.md`](../docs/deploy.md) explains *why*
each environment variable matters; this page is the order to type things in.

**Order is the whole point.** Four of these steps fail if the one above them is not finished,
and one of those failures is rate-limited to five attempts per hour.

| Piece | Where |
|---|---|
| Express API | `127.0.0.1:4000`, behind nginx at `api.<domain>` |
| Next.js CRM | `127.0.0.1:3000`, behind nginx at `crm.<domain>` |
| PostgreSQL 16 | `127.0.0.1:5432`, never exposed |
| Profile photos | AWS S3, `ap-south-1` |

---

## 0. Before the instance exists

None of this needs a server, so do it while you wait for anything else.

```bash
# Two DIFFERENT secrets. Sharing one makes a leaked access token good for thirty days.
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRM_SESSION_SECRET

# The demo sign-in code, if you are handing one to a client (config/masterOtp.js).
node -e "console.log(String(Math.floor(Math.random()*1e6)).padStart(6,'0'))"
```

Do **not** reuse the development secrets from your laptop.

Create the S3 bucket in `ap-south-1` and an IAM user restricted to it:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
  }]
}
```

No `s3:ListBucket`. The API hands out direct URLs and never lists — and a listable bucket of
profile photos is a browsable donor directory.

---

## 1. Launch the instance

- **Ubuntu Server 24.04 LTS**, region **`ap-south-1`**
- **`t3.small`** or larger. On `t3.micro`'s 1 GB the CRM build runs out of memory and is killed.
- Security group: **22 from your IP only**, **80**, **443**. Nothing else — not 3000, not 4000,
  and above all not 5432.
- **Allocate an Elastic IP and associate it.** The auto-assigned address changes on every
  stop/start, which invalidates DNS and the TLS certificate together.

---

## 2. Bootstrap

```bash
ssh -i your-key.pem ubuntu@<elastic-ip>
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/DishantDedha/RedExpress/main/deploy/bootstrap.sh)"
```

Installs Node 22, PostgreSQL 16, nginx, certbot and ufw; creates the `redexpress` service
account; clones the repo to `/srv/redexpress`; installs dependencies and `@aws-sdk/client-s3`.

**Copy the `DATABASE_URL` it prints.** The password is generated once and stored nowhere else.

---

## 3. Environment files

`backend/.env` — the `[backend]` sections of [`../.env.example`](../.env.example), plus:

```ini
NODE_ENV=production
TRUST_PROXY=1                       # exactly one proxy: nginx
BCRYPT_ROUNDS=12
DATABASE_URL=postgresql://…         # from step 2
API_BASE_URL=https://api.<domain>
CORS_ORIGINS=https://crm.<domain>   # the CRM origin, and nothing else
JWT_ACCESS_SECRET=…                 # from step 0
JWT_REFRESH_SECRET=…
STORAGE_DRIVER=s3
S3_REGION=ap-south-1
S3_BUCKET=…
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
SMS_PROVIDER=console                # until DLT registration clears
OTP_MASTER_CODE=…                   # demo only — REMOVE before real SMS goes live
PUSH_PROVIDER=console               # until the app has a dev build and an FCM key
```

`crm/.env.local`:

```ini
BACKEND_API_BASE_URL=https://api.<domain>
NEXT_PUBLIC_APP_URL=https://crm.<domain>
CRM_SESSION_SECRET=…                # from step 0
CRM_COOKIE_SECURE=true
```

`CRM_ALLOWED_ORIGINS` stays empty. nginx sets `Host` to the real hostname, so Next's
Origin-vs-Host check on Server Actions passes on its own.

`TRUST_PROXY=1` is not optional. The rate limiters key on the client IP, and behind nginx the
socket address is always `127.0.0.1` — get this wrong and every caller in the country shares
one bucket for OTP requests and password attempts.

```bash
sudo -u redexpress nano /srv/redexpress/backend/.env
sudo -u redexpress nano /srv/redexpress/crm/.env.local
sudo chmod 600 /srv/redexpress/backend/.env /srv/redexpress/crm/.env.local
```

---

## 4. DNS — and confirm it before moving on

Ask whoever holds the domain for two records. In GoDaddy the **Name** field takes only the
left-hand part; typing the full hostname creates `api.example.in.example.in`.

| Type | Name | Data | TTL |
|---|---|---|---|
| A | `api` | *your Elastic IP* | 600 |
| A | `crm` | *your Elastic IP* | 600 |

If a record with that name already exists, **edit it — do not add a second**. Two A records
for one name round-robin, so requests land on the wrong server about half the time.

```bash
nslookup api.<domain>     # must return your Elastic IP
nslookup crm.<domain>
```

**Do not continue until both return the right address.** Step 6 is rate-limited to five
failures per hostname per hour.

---

## 5. nginx

```bash
cd /srv/redexpress
sudo cp deploy/nginx/redexpress.conf /etc/nginx/sites-available/redexpress
sudo sed -i 's/API_HOST/api.<domain>/; s/CRM_HOST/crm.<domain>/' /etc/nginx/sites-available/redexpress
sudo ln -sf /etc/nginx/sites-available/redexpress /etc/nginx/sites-enabled/redexpress
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

HTTP only at this point. certbot rewrites this file to add TLS — which is why the
`server_name` lines have to be correct and loaded first. certbot edits blocks it can find; it
cannot invent them.

---

## 6. Certificate

```bash
sudo certbot --nginx -d api.<domain> -d crm.<domain>
```

One certificate covering both names. Say yes to the HTTP→HTTPS redirect. Then close the hole
that lets a stranger's domain serve your app:

```bash
sudo cp deploy/nginx/default-server.conf /etc/nginx/sites-available/default-server
sudo sed -i 's/API_HOST/api.<domain>/' /etc/nginx/sites-available/default-server
sudo ln -sf /etc/nginx/sites-available/default-server /etc/nginx/sites-enabled/000-default-server
sudo nginx -t && sudo systemctl reload nginx
```

Prove renewal works now, not on day 89:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

> **Leave port 80 open.** Renewal repeats the same HTTP challenge through it. Closing it makes
> renewals fail silently and the site breaks in 90 days, on a day you have no reason to be
> looking.

---

## 7. Migrate, build, start

```bash
cd /srv/redexpress

sudo -u redexpress npm run db:generate --workspace backend
sudo -u redexpress npm run db:deploy   --workspace backend   # applies committed migrations only
sudo -u redexpress npm run build       --workspace crm

sudo systemctl enable --now redexpress-api redexpress-crm
sudo systemctl status redexpress-api redexpress-crm --no-pager
```

**Never run `db:migrate` or `db:reset` here.** The first can author a migration from a drifted
schema; the second drops everything.

**Never run `db:seed` here.** It inserts thirty fictional donors with real-looking Odisha phone
numbers, and staff would ring them during an emergency. Create the one real administrator
instead:

```bash
cd /srv/redexpress/backend
sudo -u redexpress ADMIN_EMAIL=ops@example.org ADMIN_NAME="Ops Lead" ADMIN_PASSWORD='…' \
  npm run create:admin
```

---

## 8. Verify

```bash
curl https://api.<domain>/health/ready     # {"status":"ready","database":{"status":"up",…}}
curl -I https://crm.<domain>               # 200, and X-Frame-Options: DENY
curl -I http://api.<domain>                # 301 to https

# The catch-all: an unrecognised Host must get nothing at all.
curl -sv --resolve unknown.example:443:<elastic-ip> https://unknown.example 2>&1 | tail -3
```

Then sign in to the CRM as the administrator from step 7 and open a donor record.

---

## Updating

```bash
cd /srv/redexpress
sudo -u redexpress git pull --ff-only
sudo -u redexpress npm ci
sudo -u redexpress npm run db:deploy --workspace backend
sudo -u redexpress npm run build     --workspace crm
sudo systemctl restart redexpress-api redexpress-crm
```

## When something is wrong

```bash
journalctl -u redexpress-api -n 100 --no-pager
journalctl -u redexpress-crm -n 100 --no-pager
sudo tail -f /var/log/nginx/error.log
```

| Symptom | Cause |
|---|---|
| API exits at boot naming a variable | `config/env.js` fails fast. The message names the fix. |
| API refuses to start mentioning `OTP_MASTER_CODE` | A demo bypass is set alongside a real SMS gateway. Unset it. |
| `/health/ready` returns 503 | Postgres unreachable — `systemctl status postgresql`. |
| CRM login returns `BACKEND_UNREACHABLE` | `BACKEND_API_BASE_URL` wrong, or the API is down. |
| Login fails with `CSRF_FAILED` | The page was open across a restart. Reload it. |
| Everyone shares one rate-limit bucket | `TRUST_PROXY` unset, or nginx not sending `X-Forwarded-For`. |
| Uploads over 1 MB fail with 413 | `client_max_body_size` missing from the API server block. |
| certbot fails validation | DNS not resolving yet, or port 80 closed. |

---

## Before this is more than a prototype

Carried over from [`../docs/deploy.md`](../docs/deploy.md) — none of it blocks a demo, all of
it blocks real donors:

- `SMS_PROVIDER=msg91` with DLT registration done, and `OTP_MASTER_CODE` removed
- `PUSH_PROVIDER=expo` with an EAS dev build and FCM credentials
- Automated database backups, with a restore actually tested
- Rate limiters moved to Redis if you ever run more than one instance — the counters are in
  process memory, so N instances mean N times the configured ceilings
