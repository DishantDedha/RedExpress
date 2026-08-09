#!/usr/bin/env bash
#
# Red Express — one-time setup for a fresh Ubuntu 24.04 EC2 instance.
#
# Installs everything the three pieces need and creates the service account, but deliberately
# does NOT fetch a certificate or start the apps: both depend on DNS resolving to this machine,
# which is not this script's business to assume. deploy/README.md has the order.
#
#   curl -fsSL <raw url>/bootstrap.sh | sudo bash
#   — or —
#   sudo bash deploy/bootstrap.sh
#
# Safe to re-run.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/DishantDedha/RedExpress.git}"
APP_DIR="/srv/redexpress"
APP_USER="redexpress"
DB_NAME="redexpress"
DB_USER="redexpress"

log() { printf '\n\033[1;31m==>\033[0m %s\n' "$1"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git ufw

log "Node.js 22 LTS"
# Ubuntu's own node package is far behind; the backend needs >= 20 (package.json engines).
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

log "PostgreSQL 16"
# Native rather than Docker: one less runtime to keep alive, and systemd already restarts it.
apt-get install -y -qq postgresql postgresql-contrib
systemctl enable --now postgresql

# Postgres listens on localhost only by default on Ubuntu. Left that way on purpose — the
# database is never reachable from outside this machine, and the security group has no 5432
# rule to match even if it were.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -qc "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
  sudo -u postgres psql -qc "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  echo
  echo "  DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
  echo
  echo "  ^ Copy this into backend/.env now. It is not stored anywhere else."
  echo
else
  echo "  Role ${DB_USER} already exists — keeping the existing password."
fi

log "nginx and certbot"
apt-get install -y -qq nginx certbot python3-certbot-nginx
systemctl enable --now nginx

log "Firewall"
# Belt and braces with the AWS security group. 22 is not opened here because the security
# group already scopes it to one address; opening it again to the world would undo that.
ufw allow 'Nginx Full'   # 80 and 443
ufw allow OpenSSH
ufw --force enable
ufw status

log "Service account"
# No login shell and no password: this account exists to own files and run two processes.
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
fi

log "Application"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" pull --ff-only
fi
# Uploads only matter with STORAGE_DRIVER=local; harmless and cheap to create either way.
mkdir -p "${APP_DIR}/backend/uploads"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

log "Dependencies"
# --omit=dev at the root would drop the CRM's build toolchain, so the full install runs and
# the pruning happens after the CRM is built (see README step 6).
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" ci
# The S3 driver imports @aws-sdk/client-s3 lazily and does not declare it — see
# backend/src/services/storage/s3Storage.js.
sudo -u "${APP_USER}" npm --prefix "${APP_DIR}" install @aws-sdk/client-s3 --workspace backend

log "systemd units"
install -m 644 "${APP_DIR}/deploy/systemd/redexpress-api.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deploy/systemd/redexpress-crm.service" /etc/systemd/system/
systemctl daemon-reload

cat <<'DONE'

  Bootstrap finished. Nothing is serving yet, and that is correct.

  Next, in this order (deploy/README.md has the detail):

    1. Write backend/.env and crm/.env.local          — the DATABASE_URL above goes in the first
    2. Point DNS at this machine, then verify it       — nslookup api.<domain>
    3. Install the nginx config and run certbot        — certbot needs step 2 to have finished
    4. Migrate, build, and start the two services

  Running certbot before DNS resolves burns one of five attempts per hour, per hostname.

DONE
