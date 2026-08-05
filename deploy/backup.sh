#!/bin/sh
# backup.sh — nightly SQLite backup with 14-day retention.
# Run via cron on the host (NOT inside a container — we want backups to survive container loss).
#
# Install with:
#   sudo cp backup.sh /usr/local/bin/synthwave-backup
#   sudo chmod +x /usr/local/bin/synthwave-backup
#   echo "15 3 * * * root /usr/local/bin/synthwave-backup >> /var/log/synthwave-backup.log 2>&1" | sudo tee -a /etc/crontab

set -eu

# The Docker volume name. `docker volume inspect` to confirm.
VOLUME_NAME="${SYNTHWAVE_VOLUME:-synthwave_synthwave_data}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/synthwave}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%F-%H%M)
OUT="$BACKUP_DIR/synthwave-$DATE.db"

# Use a one-off alpine container to read the SQLite file off the volume.
# (We could also use sqlite3's online backup API but `cp` is fine for this scale —
# sql.js writes the file atomically.)
docker run --rm \
  -v "$VOLUME_NAME":/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine:3.20 \
  sh -c "cp /data/synthwave.db /backup/synthwave-$DATE.db"

echo "[$(date)] backed up to $OUT ($(du -h "$OUT" | cut -f1))"

# Prune old backups
find "$BACKUP_DIR" -name "synthwave-*.db" -mtime "+$RETENTION_DAYS" -delete
echo "[$(date)] pruned backups older than $RETENTION_DAYS days"
