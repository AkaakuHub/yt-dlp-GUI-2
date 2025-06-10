#!/bin/bash

# Version Update Script for yt-dlp-GUI
# Usage: ./scripts/update-version.sh <new_version>
# Example: ./scripts/update-version.sh 1.0.6

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <new_version>"
    echo "Example: $0 1.0.6"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (basic check)
if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format x.y.z (e.g., 1.0.6)"
    exit 1
fi

echo "Updating version to $NEW_VERSION..."

# Update Cargo.toml
sed -i.bak "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

# Update tauri.conf.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json

# Update package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json

# Remove backup files
rm -f src-tauri/Cargo.toml.bak src-tauri/tauri.conf.json.bak package.json.bak

echo "Version updated to $NEW_VERSION in:"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/tauri.conf.json"
echo "  - package.json"

echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Commit the changes: git add . && git commit -m \"Bump version to $NEW_VERSION\""
echo "3. Push to release branch: git push origin release"
echo "4. The GitHub Actions will automatically create tag v$NEW_VERSION and build the release"
