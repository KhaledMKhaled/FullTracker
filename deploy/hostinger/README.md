# Tracker on Hostinger — Ubuntu 26.04 LTS

This is a deployment kit, not proof of a live migration. VPS access, domain,
DNS cutover are not implied by these instructions. The private rehearsal has been
verified on Ubuntu 26.04.1, Node 22.22.1 and PostgreSQL 18.6; public HTTPS and final
cutover remain pending.
Do not run restore commands against your current production database.

## 1. Confirm the target

Use the Hostinger terminal or your existing SSH access. Never send passwords or
private keys in chat. Confirm `cat /etc/os-release`, `free -h`, `df -h`, domain,
and source PostgreSQL major version (`SHOW server_version;` using your authorized
production connection). Use a supported Node 22 LTS patch release and PostgreSQL
of the same major as the source, or a newer compatible version after rehearsal.
Do not assume the default Ubuntu PostgreSQL major matches the source.
Allow enough disk for the database, media, all archived backup ZIPs, two releases,
and at least two full backup sets. A database dump may be substantially larger
than ordinary application backups because it includes archive bytes.

## 2. Install services and isolate the app

Install Node 22 LTS from Ubuntu's signed repositories;
confirm `/usr/bin/node --version` and `npm --version`. Record the exact patch
version used in the release notes and use it for subsequent builds.

```sh
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx postgresql postgresql-client \
  build-essential rsync openssl
# Check pg_dump --version; install a matching/newer client if necessary.
sudo adduser --system --group --home /srv/tracker tracker
sudo install -d -o tracker -g tracker /srv/tracker/releases /srv/tracker/shared/uploads
sudo install -d -m 700 /etc/tracker /var/backups/tracker
```

Keep PostgreSQL listening only on localhost (check `ss -lntp` and its
`listen_addresses`). Restrict host authentication to scram-sha-256. Do not open
port 5432 or 5000 in the Hostinger firewall. Allow your actual SSH port before
enabling a firewall; then allow 80/443. Keep a second SSH session open when testing.

Create a dedicated database role, not a superuser:

```sh
sudo -u postgres createuser --pwprompt --no-superuser --no-createdb --no-createrole tracker
sudo -u postgres createdb --owner=tracker tracker
```

Enter a generated password privately. The app's administrator restore function
requires ownership of its own database tables; never grant cluster superuser.
For stricter separation, disable in-app restore and use an operator restore role.

## 3. Environment variables

Copy `app.env.example` to `/etc/tracker/app.env`, then edit privately:

```sh
sudo install -m 600 deploy/hostinger/app.env.example /etc/tracker/app.env
sudoedit /etc/tracker/app.env
```

| Variable | Production value / purpose |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1`, only Nginx can reach the application |
| `PORT` | `5000`; update Nginx too if changed |
| `STORAGE_MODE` | `vps`; direct uploads plus PostgreSQL media, no Replit sidecar |
| `DATABASE_URL` | `postgresql://tracker:URL_ENCODED_PASSWORD@127.0.0.1:5432/tracker` |
| `SESSION_SECRET` | Unique random value, at least 32 characters; generate privately with `openssl rand -hex 48` |
| `ROOT_PASSWORD` | Optional first-run bootstrap only, when no `root` user exists; not a password-reset setting |

For a restored database, existing usernames and password hashes are preserved.
Normally omit `ROOT_PASSWORD`. Changing `SESSION_SECRET` signs everyone out.
Do not prefix any secret with `VITE_`. Replit environment values do not
automatically transfer to Hostinger. Do not copy development DB credentials.
`PRIVATE_OBJECT_DIR` and `PUBLIC_OBJECT_SEARCH_PATHS` are Replit-only legacy
settings, not required on the VPS after legacy object migration is complete.
Domain and TLS certificate settings belong in Nginx, not a fictional app URL variable.

## 4. Prepare a release

Upload a clean source checkout into `/srv/tracker/releases/RELEASE_ID`, excluding
`.env`, node_modules, .git, uploads, database dumps and local credentials.
Use a deployment account to build; do not run npm install as root.

```sh
cd /srv/tracker/releases/RELEASE_ID
# Outside Replit only: replace its unreachable internal registry URLs.
# Package versions and integrity hashes remain unchanged.
node deploy/hostinger/prepare-lockfile.mjs
npm ci
npm run check
NODE_ENV=production npm run build
ln -s /srv/tracker/shared/uploads uploads
# Once the release passes tests, as the operator:
sudo ln -s /srv/tracker/releases/RELEASE_ID /srv/tracker/current
sudo cp deploy/hostinger/tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
```

The service working directory preserves all existing relative `/uploads/...`
URLs. Make the release read-only to the service user; only shared uploads should
be writable. Keep backup material outside uploads and never expose it via Nginx.
Do not run seed scripts on the migrated database. Do not blindly run db:push
against production; restore the matching schema and review future schema changes.

## 5. Production migration and rehearsal

Obtain an authorized production export, not the development database. Never put
the connection URL in shell history or a process argument. Use PostgreSQL service
and password files with mode 600 (`~/.pg_service.conf`, `~/.pgpass`) configured
privately on the source/operator machine.

During a confirmed write freeze, export:

```sh
PGSERVICE=tracker_source pg_dump -Fc --no-owner --no-acl --schema=public \
  --exclude-table='public.replit_*' --file=database.dump
tar -C /ACTUAL_SOURCE_APP_DIRECTORY -czf uploads.tar.gz uploads
sha256sum database.dump uploads.tar.gz > SHA256SUMS
```

This migration dump MUST include `media_assets`, `backup_archives`,
`backup_jobs`, users and sessions schema. Do not use the app's ordinary ZIP
backup as your only migration source: it intentionally excludes backup archives
and sessions. Retain an encrypted copy of original migration files.

Inventory every image/attachment reference in shipment_items, products, parties,
shipment_payments, local_invoice_lines and backup_jobs before cutover. Query the
actual schema for other URL columns as well. Check `/media/` references against
database assets and `/uploads/` against exported files. For `/objects/`,
storage.googleapis.com URLs and remote backup paths, export bytes through the
authorized source storage service. Import them into a durable destination and
update a reviewed URL mapping in the *destination only*. Legacy backup ZIPs can
be uploaded using the authenticated backup-upload flow. Do not mark cutover ready
while any object reference is unresolved; simply disabling Replit storage does
not migrate old objects. Record counts, byte sizes and SHA-256 hashes in a
protected migration inventory, not in the public repository.

Transfer via SSH/SFTP. On the destination, verify `sha256sum -c SHA256SUMS`.
Rehearse into a NEW database:

```sh
sudo -u postgres createdb --owner=tracker tracker_rehearsal
# ONLY in the newly created, empty rehearsal database:
# pg_dump includes CREATE SCHEMA public; remove the empty default first.
# No CASCADE: this fails safely if the schema is not empty.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d tracker_rehearsal -c 'DROP SCHEMA public;'
# Put the dump somewhere postgres can read without making it world-readable.
sudo -u postgres pg_restore --exit-on-error --single-transaction --no-owner \
  --no-acl --role=tracker -d tracker_rehearsal /PROTECTED_PATH/database.dump
```

Compare table counts, shipment/payment totals by currency, user count, sequences,
media/backup archive counts and binary sizes against the frozen source. Test
login, all upload categories, old attachments, PDF exports and backup downloads
against the rehearsal database. Run a backup/restore test into another empty DB.
No migration has been verified until these checks pass on the actual target.

For final cutover, repeat the export under a write freeze and restore into the
empty `tracker` DB using the same command with `-d tracker`. Never add `--clean`
to an unreviewed command. Remove its empty default public schema first as in the
rehearsal instructions; never do this on an existing app database. Extract uploads into a staging directory, inspect the
trusted archive for absolute paths, traversal and symlinks, then copy its uploads
contents into `/srv/tracker/shared/uploads` with owner tracker:tracker.
Keep both old and new sites closed to writes until final checks complete.

## 6. HTTPS and start

Replace `tracker.example.com` in nginx.conf with your confirmed domain:

```sh
sudo cp deploy/hostinger/nginx.conf /etc/nginx/sites-available/tracker
sudo ln -s /etc/nginx/sites-available/tracker /etc/nginx/sites-enabled/tracker
sudo nginx -t
sudo systemctl reload nginx
# Only after approved DNS change and inbound 80/443 connectivity:
sudo certbot --nginx -d YOUR_DOMAIN
sudo certbot renew --dry-run
sudo systemctl enable --now tracker
curl --fail http://127.0.0.1:5000/healthz
curl --fail https://YOUR_DOMAIN/healthz
sudo journalctl -u tracker -n 100 --no-pager
```

HTTP is only for certificate setup/redirect; production login requires HTTPS.
Confirm Secure/HttpOnly cookies, correct proxy protocol, protected API 401 when
signed out, and that backup archives are not publicly served. Do not use Nginx
`alias` to expose the entire shared directory.

## 7. Backups, updates and rollback

`backup.sh` runs as root, uses local PostgreSQL peer authentication and pauses
the app briefly to align file and database snapshots. It includes previous
database-stored ZIP archives intentionally: these are independent external
snapshots, not recursively stored inside the database.

```sh
sudo cp deploy/hostinger/tracker-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start tracker-backup
sudo systemctl enable --now tracker-backup.timer
sudo systemctl list-timers tracker-backup.timer
```

Nightly backups introduce brief maintenance downtime. Review runtime and choose
a suitable schedule before enabling. A failed backup remains without `COMPLETE`;
alert on failed service status or no recent COMPLETE backup. No automatic
deletion is configured. Monitor `df -h`, archive growth and logs; set retention
only after independent restore checks and verified off-server copies.
Copy only completed backups using encrypted SSH transport to a separate host,
e.g. `rsync -a -e ssh /var/backups/tracker/ BACKUP_USER@BACKUP_HOST:tracker/`.
Restrict destination access and encrypt backups at rest; DB dumps contain
password hashes and financial data. Off-server access/setup is still required.
Test restore monthly into a new DB and isolated uploads directory.

For updates, build a new release, take a verified backup, review any schema
change, stop tracker, replace current symlink with the new release and start.
For code-only rollback stop tracker, point current at the previous release and
start again. Never restore a pre-cutover DB after accepting new payments without
reconciling those writes. If schema changed, restore a matching backup into a new
database and validate it before switching the connection.
Keep the source deployment intact and read-only during the rollback window.

## Verification status

Repository tests and build can be checked here. Ubuntu package installation,
systemd/Nginx/HTTPS, production import, live signed-in flows, off-server backups
and DNS cutover need authorized access to the actual VPS and are not claimed as
completed by this kit.
