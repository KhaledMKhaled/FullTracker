#!/usr/bin/env bash
# Run as root on VPS only. Brief maintenance pause gives DB + files one boundary.
set -euo pipefail
umask 077
exec 9>/run/lock/tracker-backup.lock
flock -n 9 || exit 1
destination="/var/backups/tracker/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$destination"
was_running=false
if systemctl is-active --quiet tracker; then was_running=true; fi
restart_app() { if "$was_running"; then systemctl start tracker; fi; }
trap restart_app EXIT
systemctl stop tracker
# Peer auth as postgres: no credentials in arguments or logs.
runuser -u postgres -- pg_dump -Fc --no-owner --no-acl --schema=public tracker > "$destination/database.dump"
tar -C /srv/tracker/shared -czf "$destination/uploads.tar.gz" uploads
cd "$destination"
sha256sum database.dump uploads.tar.gz > SHA256SUMS
touch COMPLETE
echo "Backup complete: $destination"
# No automatic deletion: configure retention only after off-server restore tests.
