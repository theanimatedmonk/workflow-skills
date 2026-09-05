#!/usr/bin/env bash
# Install Cursor skills for the current user (available in every repo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.cursor/skills"

mkdir -p "$DEST"
for name in design-system-3-level design-system-2-level css-modules token-inspect svg; do
  src="$ROOT/$name"
  dest="$DEST/$name"
  if [ ! -d "$src" ]; then
    echo "Missing skill folder: $src" >&2
    exit 1
  fi
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "Skip $name: $dest already exists and is not a symlink. Remove it to reinstall."
    continue
  fi
  rm -f "$dest"
  ln -s "$src" "$dest"
  echo "Linked $dest -> $src"
done

echo "Done. New Cursor chats will see: design-system-3-level, design-system-2-level, css-modules, token-inspect, svg."
