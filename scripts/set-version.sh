#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read current version from the latest git tag (most reliable source)
LATEST_TAG=$(git -C "$ROOT_DIR" tag -l 'v*' --sort=-v:refname | head -1)
if [ -n "$LATEST_TAG" ]; then
  CURRENT="${LATEST_TAG#v}"
else
  # Fall back to package.json if no tags exist
  CURRENT=$(grep -o '"version": "[^"]*"' "$ROOT_DIR/package.json" | head -1 | cut -d'"' -f4)
fi
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT%%-*}"

echo "Current version: $CURRENT (from ${LATEST_TAG:-package.json})"
echo ""

# Find next available version (skip existing tags)
next_available() {
  local maj=$1 min=$2 pat=$3
  while git -C "$ROOT_DIR" tag -l "v$maj.$min.$pat" | grep -q .; do
    ((pat++))
  done
  echo "$maj.$min.$pat"
}

NEXT_PATCH=$(next_available "$MAJOR" "$MINOR" "$((PATCH + 1))")
NEXT_MINOR=$(next_available "$MAJOR" "$((MINOR + 1))" 0)
NEXT_MAJOR=$(next_available "$((MAJOR + 1))" 0 0)

echo "Select version bump:"
echo "  1) Patch  → $NEXT_PATCH"
echo "  2) Minor  → $NEXT_MINOR"
echo "  3) Major  → $NEXT_MAJOR"
echo "  4) Custom → enter manually"
echo ""
read -rp "Choice [1-4]: " choice

case $choice in
  1) VERSION="$NEXT_PATCH" ;;
  2) VERSION="$NEXT_MINOR" ;;
  3) VERSION="$NEXT_MAJOR" ;;
  4)
    echo ""
    read -rp "Enter version: " VERSION
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Validate
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: Invalid semver format '$VERSION'"
  echo "Expected format: X.Y.Z or X.Y.Z-prerelease"
  exit 1
fi

echo ""
echo "Bumping version: $CURRENT → $VERSION"
echo ""

# Update version in all files
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE=(sed -i '')
else
  SED_INPLACE=(sed -i)
fi

"${SED_INPLACE[@]}" "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/package.json"
"${SED_INPLACE[@]}" "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"
"${SED_INPLACE[@]}" "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

echo "Updated version in:"
echo "  - package.json"
echo "  - src-tauri/tauri.conf.json"
echo "  - src-tauri/Cargo.toml"

# Commit and tag
cd "$ROOT_DIR"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to $VERSION"
git tag "v$VERSION"

echo "Created git tag v$VERSION"

# Push commit and tag
git push
git push origin "v$VERSION"

echo "Pushed commit and tag v$VERSION to remote"
