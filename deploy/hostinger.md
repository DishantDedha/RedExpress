# Deploying Red Express to a Hostinger KVM VPS

The single-box setup on Hostinger: backend, CRM and PostgreSQL on one Ubuntu machine, nginx in
front, photos on the local NVMe. [`README.md`](README.md) is the same runbook for EC2 and
[`../docs/deploy.md`](../docs/deploy.md) explains *why* each variable matters; this page is the
order to type things in on Hostinger specifically.

**Order is the whole point.** Four of these steps fail if the one above them is not finished,
and one of those failures is rate-limited to five attempts per hour.

| Piece | Where |
|---|---|
| Express API | `127.0.0.1:4000`, behind nginx at `api.getablood.com` |
| Next.js CRM | `127.0.0.1:3000`, behind nginx at `crm.getablood.com` |
| PostgreSQL | `127.0.0.1:5432`, never exposed |
| Profile photos | `/srv/redexpress/backend/uploads` on the VPS disk |

## What differs from the EC2 runbook

| EC2 | Hostinger KVM |
|---|---|
| Elastic IP, or the address changes on stop/start | IPv4 is already static. Nothing to allocate. |
| Security group scopes port 22 to your IP | No security group. `ufw` is the only firewall, and `bootstrap.sh` configures it. |
| `t3.small` minimum — the CRM build OOMs on 1 GB | KVM 2 is 8 GB. The build has room to spare; no swap file needed. |
| Photos must go to S3 | 100 GB of persistent NVMe. `STORAGE_DRIVER=local`, no AWS account. |
| Ubuntu 24.04, PostgreSQL 16 | Ubuntu 26.04, PostgreSQL 17/18 from the distro. Prisma is fine with it — the dev laptop already runs 18. |

---

## 0. While the VPS is still provisioning

On the Hostinger setup wizard's **Additional features** screen, leave both boxes unchecked.
Monarx targets PHP on shared hosting and finds nothing on a Node box; Docker is not used here
because PostgreSQL is installed natively — one less runtime to keep alive, and systemd already
restarts it. Both can be added later from the VPS dashboard.

Generate the production secrets on your own machine. **Do not reuse the development values.**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRM_SESSION_SECRET
node -e "console.log(String(require('crypto').randomInt(0,1e6)).padStart(6,'0'))"  # OTP_MASTER_CODE
```

The master code must be exactly `OTP_LENGTH` digits — 6, not the widget's 4.

---

## 1. DNS, before anything else

Let's Encrypt will not issue for a bare IP, and without TLS the CRM's `Secure` session cookies
are never sent back by the browser — which looks exactly like a broken login. So the hostnames
have to resolve before anything else is worth doing.

The domain is managed at GoDaddy (`ns09`/`ns10.domaincontrol.com`). Two A records, both to the
VPS:

| Type | Name | Data | TTL |
|---|---|---|---|
| A | `api` | `148.135.138.94` | 600 |
| A | `crm` | `148.135.138.94` | 600 |

The Name field takes only the left-hand part — typing the full hostname creates
`api.getablood.com.getablood.com`. If a record with that name already exists, **edit it, do not
add a second**: two A records for one name round-robin, so requests land on the wrong server
about half the time.

**Leave `@`, `admin`, `mail` and the cPanel CNAMEs alone.** They point at the shared host on
`198.12.237.97`, which keeps serving the main site and email. This VPS only ever answers for
`api` and `crm`.

```bash
nslookup api.getablood.com    # must return 148.135.138.94
nslookup crm.getablood.com
```

**Do not continue until both resolve.** Step 5 is rate-limited to five failures per hostname
per hour.

> No domain available? [DuckDNS](https://www.duckdns.org) works as a stand-in — it is free and
> `duckdns.org` is on the [Public Suffix List](https://publicsuffix.org/list/), so each
> subdomain gets its own Let's Encrypt rate-limit bucket. `nip.io` and `sslip.io` are not, and
> their shared bucket is routinely exhausted.

---

## 2. Bootstrap

```bash
ssh root@148.135.138.94
bash -c "$(curl -fsSL https://raw.githubusercontent.com/DishantDedha/RedExpress/main/deploy/bootstrap.sh)"
```

Installs Node 22, PostgreSQL, nginx, certbot and ufw; creates the `redexpress` service account;
clones the repo to `/srv/redexpress`; installs dependencies. It is safe to re-run.

**Copy the `DATABASE_URL` it prints.** The password is generated once and stored nowhere else.

The script opens 22, 80 and 443 in `ufw` and nothing else — not 3000, not 4000, and above all
not 5432. If you also switch on the hPanel firewall, it must allow the same three or you will
lock yourself out of SSH.

> If NodeSource fails on 26.04, Ubuntu's own `nodejs` package already satisfies the `>=20`
> engine requirement: `apt-get install -y nodejs npm && node -v`.
>
> If `python3-certbot-nginx` is not in the archive yet, use the snap:
> `snap install --classic certbot && ln -sf /snap/bin/certbot /usr/bin/certbot`.

---

## 3. Environment files

Write `backend/.env` and `crm/.env.local` — the full contents are in [`README.md`](README.md)
§3, with these Hostinger differences: `STORAGE_DRIVER=local` (no `S3_*` keys at all) and the
DuckDNS hostnames in `API_BASE_URL`, `CORS_ORIGINS`, `CRM_BASE_URL`, `BACKEND_API_BASE_URL`
and `NEXT_PUBLIC_APP_URL`.

```bash
sudo -u redexpress nano /srv/redexpress/backend/.env
sudo -u redexpress nano /srv/redexpress/crm/.env.local
chmod 600 /srv/redexpress/backend/.env /srv/redexpress/crm/.env.local
```

`TRUST_PROXY=1` is not optional. The rate limiters key on the client IP, and behind nginx the
socket address is always `127.0.0.1` — get this wrong and every caller in the country shares
one bucket for OTP requests and password attempts.

---

## 4. nginx

```bash
cd /srv/redexpress
cp deploy/nginx/redexpress.conf /etc/nginx/sites-available/redexpress
sed -i 's/API_HOST/api.getablood.com/; s/CRM_HOST/crm.getablood.com/' \
  /etc/nginx/sites-available/redexpress
ln -sf /etc/nginx/sites-available/redexpress /etc/nginx/sites-enabled/redexpress
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

HTTP only at this point. certbot rewrites this file to add TLS, which is why the `server_name`
lines have to be correct and loaded first — certbot edits blocks it can find, it cannot invent
them.

---

## 5. Certificate

```bash
certbot --nginx -d api.getablood.com -d crm.getablood.com
```

One certificate covering both names. Say yes to the HTTP→HTTPS redirect. Then close the hole
that lets a stranger's domain serve your app:

```bash
cp deploy/nginx/default-server.conf /etc/nginx/sites-available/default-server
sed -i 's/API_HOST/api.getablood.com/' /etc/nginx/sites-available/default-server
ln -sf /etc/nginx/sites-available/default-server /etc/nginx/sites-enabled/000-default-server
nginx -t && systemctl reload nginx

certbot renew --dry-run
```

> **Leave port 80 open.** Renewal repeats the same HTTP challenge through it. Closing it makes
> renewals fail silently and the site breaks in 90 days, on a day you have no reason to be
> looking.

---

## 6. Migrate, build, start

```bash
cd /srv/redexpress
sudo -u redexpress npm run db:generate --workspace backend
sudo -u redexpress npm run db:deploy   --workspace backend
sudo -u redexpress npm run build       --workspace crm

systemctl enable --now redexpress-api redexpress-crm
systemctl status redexpress-api redexpress-crm --no-pager
```

**Never run `db:migrate` or `db:reset` here.** The first can author a migration from a drifted
schema; the second drops everything.

**Never run `db:seed` here.** It inserts thirty fictional donors with real-looking Odisha phone
numbers, and staff would ring them during an emergency. Create the one real administrator:

```bash
cd /srv/redexpress/backend
sudo -u redexpress ADMIN_EMAIL=ops@example.org ADMIN_NAME="Ops Lead" ADMIN_PASSWORD='…' \
  npm run create:admin
```

---

## 7. Verify

```bash
curl https://api.getablood.com/health/ready   # {"status":"ready","database":{"status":"up",…}}
curl -I https://crm.getablood.com             # 200, and X-Frame-Options: DENY
curl -I http://api.getablood.com              # 301 to https
```

Then sign in to the CRM as that administrator, open a donor record, and upload a profile photo
— the upload is the one thing this setup does differently from EC2, and a 500 here means the
`uploads` directory is not writable by the service account.

---

## 8. Point the app at the new API

`mobile/.env` still names the Render host. Change it, commit it, and ship a build:

```ini
EXPO_PUBLIC_API_BASE_URL=https://api.getablood.com
```

EAS builds ignore `mobile/.env` entirely and read the `env` block of the matching profile in
`eas.json` — change both, or a build will behave differently from what you just tested.

Only once the app and CRM are confirmed working against this box should the Render service and
the Neon database be deleted.

---

## Backups — read this before going live

Photos are on local disk now, which means they are only as durable as this VPS. Two things,
neither optional:

1. **Turn on Hostinger's automatic backups** in the VPS dashboard. They cover the whole disk,
   which is what you want when the database and the uploads are both on it.
2. **Take a nightly database dump**, because a weekly whole-disk snapshot is a poor recovery
   point for Postgres. Write `/etc/cron.daily/redexpress-db-backup`:

```sh
#!/bin/sh
set -e
d=/var/backups/redexpress; mkdir -p "$d"
sudo -u postgres pg_dump -Fc redexpress > "$d/redexpress-$(date +%F).dump"
find "$d" -name 'redexpress-*.dump' -mtime +14 -delete
```

```bash
chmod +x /etc/cron.daily/redexpress-db-backup
/etc/cron.daily/redexpress-db-backup && ls -lh /var/backups/redexpress
```

A backup you have never restored is a hypothesis. Restore one into a scratch database once.

---

## Updating

```bash
cd /srv/redexpress
sudo -u redexpress git pull --ff-only
sudo -u redexpress npm ci
sudo -u redexpress npm run db:deploy --workspace backend
sudo -u redexpress npm run build     --workspace crm
systemctl restart redexpress-api redexpress-crm
```

## When something is wrong

```bash
journalctl -u redexpress-api -n 100 --no-pager
journalctl -u redexpress-crm -n 100 --no-pager
tail -f /var/log/nginx/error.log
```

The symptom table in [`README.md`](README.md) applies unchanged, plus:

| Symptom | Cause |
|---|---|
| Photo upload returns 500 | `uploads` not owned by `redexpress`, or the path is outside the unit's `ReadWritePaths`. |
| SSH stops responding after a config change | hPanel firewall enabled without an allow rule for 22. Use the browser terminal in hPanel to fix `ufw`. |
| certbot fails validation | DNS not resolving yet, or port 80 closed. |

---
