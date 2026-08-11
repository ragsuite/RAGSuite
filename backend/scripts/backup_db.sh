#!/bin/bash
# Database backup script — run before migrations or major deploys.
# Usage: DATABASE_URL=postgresql://... ./backup_db.sh
#        Or rely on DATABASE_URL already in environment.

set -e

TIMESTAMP=$(date +%Y%m%dT%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ragsuite}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/ragsuite-$TIMESTAMP.dump"

echo "Backing up database to $BACKUP_FILE ..."
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "Backup complete: $BACKUP_FILE ($SIZE)"

# Keep only last 10 backups to avoid filling disk
ls -t "$BACKUP_DIR"/ragsuite-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "Old backups pruned (keeping last 10)"
