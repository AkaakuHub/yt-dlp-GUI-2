#!/bin/bash

# Automated Version Update and Release Script for yt-dlp-GUI
# Usage: ./scripts/update-version.sh <new_version>
# Example: ./scripts/update-version.sh 1.0.9

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <new_version>"
    echo "Example: $0 1.0.9"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (basic check)
if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format x.y.z (e.g., 1.0.9)"
    exit 1
fi

echo "🚀 Starting automated release process for version $NEW_VERSION..."

# NOTE: In CI (CI env var is set), git operations are skipped; the script only updates files.
if [ -z "$CI" ]; then
    # Check if we have uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
        git status
        exit 1
    fi

    # Get current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    echo "📍 Current branch: $CURRENT_BRANCH"

    # Ensure we have the latest changes
    echo "🔄 Fetching latest changes..."
    git fetch origin

    # Switch to release branch (create if doesn't exist)
    echo "🔀 Switching to release branch..."
    if git show-ref --verify --quiet refs/heads/release; then
        git checkout release
        git pull origin release
    else
        git checkout -b release
    fi

    # Merge changes from current branch if not already on release
    if [ "$CURRENT_BRANCH" != "release" ]; then
        echo "🔀 Merging changes from $CURRENT_BRANCH..."
        git merge "$CURRENT_BRANCH" --no-edit
    fi
fi

echo "📝 Updating version files to $NEW_VERSION..."

# Update Cargo.toml
sed -i.bak "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml

# Update tauri.conf.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json

# Update package.json
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json

# Remove backup files
rm -f src-tauri/Cargo.toml.bak src-tauri/tauri.conf.json.bak package.json.bak

echo "✅ Version updated to $NEW_VERSION in:"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/tauri.conf.json"
echo "  - package.json"

# Commit and push changes
if [ -z "$CI" ]; then
    echo "📦 Committing changes..."
    git add .
    git commit -m "v$NEW_VERSION"

    echo "🚀 Pushing to release branch..."
    git push origin release
fi

echo "✨ Release process initiated!"
echo ""
echo "🔄 The following will happen automatically:"
echo "  1. GitHub Actions will create tag v$NEW_VERSION"
echo "  2. Multi-platform builds will be triggered"
echo "  3. GitHub Release will be created with artifacts"
echo ""
echo "🔗 Monitor progress at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/' | sed 's/\.git$//')/actions"

if [ -z "$CI" ] && [ "$CURRENT_BRANCH" != "release" ]; then
    echo "🔀 Switching back to $CURRENT_BRANCH branch..."
    git checkout "$CURRENT_BRANCH"
fi
