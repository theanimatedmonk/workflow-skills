#!/usr/bin/env bash
# Install these Cursor skills for the current user (any repo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.cursor/skills"

mkdir -p "$DEST"
for name in design-system-3-level design-system-2-level css-modules; do
  src="$ROOT/$name"
  dest="$DEST/$name"
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "Skip $name: $dest already exists and is not a symlink. Remove it to reinstall."
    continue
  fi
  rm -f "$dest"
  ln -s "$src" "$dest"
  echo "Linked $dest -> $src"
done

echo "Done. New Cursor chats will see: design-system-3-level, design-system-2-level, css-modules."
