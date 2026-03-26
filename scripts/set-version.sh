#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read current version from package.json
CURRENT=$(grep -o '"version": "[^"]*"' "$ROOT_DIR/package.json" | head -1 | cut -d'"' -f4)
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT%%-*}"

echo "Current version: $CURRENT"
echo ""

# Interactive menu with arrow key selection
select_option() {
  local options=("$@")
  local selected=0
  local count=${#options[@]}

  # Hide cursor
  tput civis

  # Print options
  for i in "${!options[@]}"; do
    if [ $i -eq $selected ]; then
      echo "  > ${options[$i]}"
    else
      echo "    ${options[$i]}"
    fi
  done

  while true; do
    # Read a single keypress
    read -rsn1 key
    if [[ $key == $'\x1b' ]]; then
      read -rsn2 key
      case $key in
        '[A') # Up arrow
          ((selected > 0)) && ((selected--))
          ;;
        '[B') # Down arrow
          ((selected < count - 1)) && ((selected++))
          ;;
      esac
      # Redraw
      tput cuu "$count"
      for i in "${!options[@]}"; do
        tput el
        if [ $i -eq $selected ]; then
          echo "  > ${options[$i]}"
        else
          echo "    ${options[$i]}"
        fi
      done
    elif [[ $key == "" ]]; then
      # Show cursor
      tput cnorm
      return $selected
    fi
  done
}

NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="$((MAJOR + 1)).0.0"

echo "Select version bump:"
select_option "Patch  → $NEXT_PATCH" "Minor  → $NEXT_MINOR" "Major  → $NEXT_MAJOR" "Custom → enter manually"
choice=$?

case $choice in
  0) VERSION="$NEXT_PATCH" ;;
  1) VERSION="$NEXT_MINOR" ;;
  2) VERSION="$NEXT_MAJOR" ;;
  3)
    echo ""
    read -rp "Enter version: " VERSION
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
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/package.json"
sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$ROOT_DIR/src-tauri/tauri.conf.json"
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" "$ROOT_DIR/src-tauri/Cargo.toml"

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
