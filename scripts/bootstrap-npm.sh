#!/usr/bin/env bash
# One-time npm bootstrap, run by the package owner after `npm login`:
# the first publish of the version in package.json (npm needs the package
# to exist before trusted publishing), then the trusted publisher that
# .github/workflows/publish.yml uses for every later version tag.
# Idempotent: a published version and an existing trust are left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")

if npm view "$name@$version" version >/dev/null 2>&1; then
  echo "$name@$version is already published"
else
  npm ci
  npm run lint
  npm run build
  npm test
  npm publish --access public
fi

if npm trust list "$name" 2>/dev/null | grep -q 'publish\.yml'; then
  echo "the trusted publisher for publish.yml is already set"
else
  npm trust github "$name" --file publish.yml --repository writeitai/n8n-nodes-mountable \
    --environment release --allow-publish --yes
fi
