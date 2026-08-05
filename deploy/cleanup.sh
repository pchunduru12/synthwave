#!/bin/sh
# cleanup.sh — prune creation artifact directories older than 30 days.
# Doesn't touch the SQLite DB; only removes the per-creation folders under storage/.
# Safe to run while the API is running — sql.js doesn't reference these files,
# and the API will simply 404 on /artifacts/<old-id>/... if a user opens a stale link.
#
# Schedule with cron:
#   0 4 * * * root /usr/local/bin/synthwave-cleanup >> /var/log/synthwave-cleanup.log 2>&1

set -eu

VOLUME_NAME="${SYNTHWAVE_VOLUME:-synthwave_synthwave_data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

docker run --rm \
  -v "$VOLUME_NAME":/data \
  alpine:3.20 \
  sh -c "find /data/storage -mindepth 1 -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; -print"

echo "[$(date)] cleaned creations older than $RETENTION_DAYS days"
