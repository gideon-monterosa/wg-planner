#!/usr/bin/env bash
# Tags a release: `mise run release -- X.Y.Z`. Pushing the tag makes GitHub
# Actions deploy it to production (.github/workflows/deploy.yml).
set -euo pipefail

fail() {
  echo "release: $*" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail "usage: mise run release -- X.Y.Z"
version="$1"
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail "\"$version\" is not a semver version (X.Y.Z)"
tag="v$version"

[ -z "$(git status --porcelain)" ] || fail "working tree is not clean; commit or stash your changes first"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || fail "releases are cut from main, but you are on \"$branch\""

git fetch --quiet --tags origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "main is not up to date with origin/main; pull or push first"

if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
  fail "tag $tag already exists"
fi

echo "Tagging $(git rev-parse --short HEAD) as $tag and pushing the tag to origin."
echo "GitHub Actions will deploy $tag to production."
git tag --annotate "$tag" --message "Release $tag"
git push origin "refs/tags/$tag"
