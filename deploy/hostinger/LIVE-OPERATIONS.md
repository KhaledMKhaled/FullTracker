# Live Hostinger operations

## Current hosting

Production traffic for https://mohamed-fouda.com is served by the Hostinger VPS.
The app connects to local PostgreSQL, not the Replit database. Replit remains a
development workspace and retained migration source; it is not a synchronized
production database. Never copy the old source over the live VPS after cutover.

- Service: `tracker.service`, enabled at boot, automatic restart on failure.
- Release symlink: `/srv/tracker/current`.
- Production database: `tracker`, accessible only on localhost.
- Persistent files: `/srv/tracker/shared/uploads`.
- Private environment file: `/etc/tracker/app.env`, root-owned, mode 600.
- Public endpoint: `/healthz`.
- Nginx: `/etc/nginx/sites-available/tracker`.
- Certificate: Certbot webroot renewal, with Nginx reload hook and timer.
- Backups: `/var/backups/tracker`, root-only.
- Nightly schedule: `tracker-backup.timer`, 02:00 UTC, with brief app downtime.

The current symlink points to a release directory named for its earlier rehearsal;
the production service uses the final `tracker` database and shared production
uploads. `tracker-rehearsal` is stopped. Do not restart it against production files.

## Environment variables installed

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_MODE=vps
DATABASE_URL=postgresql://tracker:REDACTED@127.0.0.1:5432/tracker
SESSION_SECRET=REDACTED
```

These values are documentation, not a usable credentials file. Secrets were
generated privately on the VPS. ROOT_PASSWORD is not configured: existing user
accounts were preserved. Do not print the environment file or paste it in chat.
Use `sudoedit /etc/tracker/app.env` only when configuration changes are needed.
The placeholder template is `app.env.example`.

## Verified at cutover

- Final source dump transferred with matching SHA-256 checksum.
- All 30 destination table counts and full-row checksums matched the snapshot.
- Source non-session table checksums remained unchanged before opening the site.
- 111 uploaded files copied and checksum-verified.
- Restored rehearsal backup matched table counts and media/archive binary hashes.
- Public HTTPS login and Secure/HttpOnly session cookie verified.
- Authenticated user, shipment, payment statistics and backup-list APIs returned 200.
- Backup download returned a valid 1024-byte HTTP 206 range.
- Public login page visually verified; signed-in UI/PDF/export workflows were not
  exhaustively browser-tested during this migration.
- Production backup completed; certificate renewal dry-run succeeded.

There are 16 pre-existing missing files (2 item images, 14 payment attachments).
They were unavailable on the source and in its three stored ZIP archives. Their
records were preserved, as approved. See the supplied missing-file report.

## Remaining separation and resilience work

1. In Replit Publishing, shut down the old published deployment. This is an
   account-side action, not something completed by the VPS setup. Retain the
   source database and code temporarily for recovery; do not use the old URL
   for new records.
2. Domain registration/DNS remain managed through Replit. Moving registration
   is separate from hosting migration. If complete separation is required,
   arrange registrar transfer through Replit Support, preserving live DNS.
   Do not delete the domain or disable renewal as a substitute for transfer.
3. Off-server backup replication is not configured. The migration copy and
   nightly backups on the VPS do not protect against loss of that VPS.
   Configure an independent encrypted destination, alerting and retention.
   Until then, monitor free disk; current backup policy does not delete old sets.

## Operator checks

```sh
systemctl status tracker --no-pager
curl --fail https://mohamed-fouda.com/healthz
journalctl -u tracker -n 100 --no-pager
systemctl list-timers tracker-backup.timer certbot.timer
df -h /
# Manual scheduled-backup test introduces brief downtime:
systemctl start tracker-backup
# Suppress Certbot's normal random delay for a bounded manual test:
certbot renew --dry-run --no-random-sleep-on-renew --cert-name mohamed-fouda.com
```

Never run an old-database restore over this live database to roll back code.
Build a new release for updates, preserve the shared uploads symlink, and use a
new isolated database for restore tests. Schema changes require their own reviewed
migration; Replit publishing no longer changes the live VPS database.
