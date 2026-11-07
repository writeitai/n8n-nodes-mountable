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

# The trust must name this repository, publish.yml and the environment
# "release", with publish permission. Any other configuration stops the
# script rather than being replaced.
trust=$(npm trust list "$name" --json 2>/dev/null || true)
state=$(TRUST="$trust" node -e '
  const text = (process.env.TRUST || "").trim();
  let items = [];
  if (text) {
    try { items = [].concat(JSON.parse(text)); }
    catch { items = JSON.parse("[" + text.replace(/}\s*{/g, "},{") + "]"); }
  }
  const ok = items.some((t) => t.file === "publish.yml" &&
    t.repository === "writeitai/n8n-nodes-mountable" && t.environment === "release" &&
    [].concat(t.permissions || []).includes("createPackage"));
  console.log(ok ? "set" : items.length ? "other" : "none");
')
case "$state" in
  set) echo "the trusted publisher for publish.yml is already set" ;;
  other) echo "npm has a different trusted publisher for $name; fix it by hand" >&2; exit 1 ;;
  none)
    npm trust github "$name" --file publish.yml --repository writeitai/n8n-nodes-mountable \
      --environment release --allow-publish --yes
    # npm expires a trust that has not published within two days.
    echo "Now release the next version through publish.yml within two days." ;;
esac
