#!/bin/bash

# Re-tag script to force trigger build workflow
# Usage: ./scripts/retag.sh <version>
# Example: ./scripts/retag.sh 1.0.6

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 1.0.6"
    exit 1
fi

VERSION="$1"
TAG="v$VERSION"

echo "Re-tagging version $VERSION..."

# Delete tag locally and remotely
echo "Deleting existing tag $TAG..."
git tag -d "$TAG" 2>/dev/null || echo "Local tag $TAG does not exist"
git push origin --delete "$TAG" 2>/dev/null || echo "Remote tag $TAG does not exist"

# Wait a moment
echo "Waiting 5 seconds..."
sleep 5

# Create and push new tag
echo "Creating new tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "Tag $TAG has been re-created and pushed"
echo "This should trigger the build workflow"
