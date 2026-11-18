# Deployment

WG Planner runs as one Cloudflare Worker (static assets + `/api/*`) with one D1
database per environment. Tooling: `cf` 1.0 and the Cloudflare Vite plugin 2,
both pinned in `mise.toml` and `package.json`.

## Environments

| Mode | Worker | D1 database | Login |
| --- | --- | --- | --- |
| `development` | `wg-planner-dev` (local only) | local, under `.cloudflare/state` | `DEV_USER_EMAIL` from `.dev.vars` |
| `integration` | `wg-planner-int` | `wg-planner-int` | Cloudflare Access |
| `production` | `wg-planner` | `wg-planner` | Cloudflare Access |

Where each piece is defined:

- **`environments.json`** (committed): the single source of truth for each mode's
  Worker name, D1 name and ID, and Access team domain and AUD. `null` means
  "don't bind" (development only). An empty string is bound as empty: the Worker
  then answers 500 `auth_not_configured`, so a half-configured environment fails
  closed. Fill in the empty IDs once the resources exist.
- **`cloudflare.config.ts`**: picks the block for `--mode` and builds the Worker
  config from it. An unknown mode fails the build.
- **`mise.toml`** tasks read IDs through `scripts/env.mjs <mode> <key>`, which
  fails when the value is empty.
- **GitHub**: environments `integration` and `production`, each with the secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Add required reviewers to
  `production` if you want a manual approval step.
- **Cloudflare**: the two D1 databases, the two Workers (created by the first
  deploy), and an Access application per hostname, whose team domain and AUD go
  into `environments.json`.

API token permissions (account scope): **Workers Scripts: Edit**, **D1: Edit**,
and **Account Settings: Read** if `cf` asks for it.

## How deploys happen

`.github/workflows/deploy.yml`:

- **Pull requests and every push**: `check` runs tests, typecheck,
  `cf build --mode integration` and a deploy dry run. No secrets.
- **Push to `main`**: after `check`, deploys to integration: build, remote D1
  migrations, `cf deploy --prebuilt --mode integration`.
- **Tag `vX.Y.Z`**: after `check`, verifies the tagged commit is on `main`, then
  does the same for production.

Manual fallbacks: `mise run deploy:int`, `mise run deploy:prod`,
`mise run db:migrate:int`, `mise run db:migrate:prod`.

## Releasing

```bash
mise run release -- 1.2.0
```

This checks the version format, a clean tree on `main` that matches
`origin/main`, and that `v1.2.0` doesn't exist yet. It then creates the annotated
tag and pushes only that tag; GitHub Actions deploys it to production.

## Rollback

Tag an earlier commit of `main` with a new version and push it, for example
`git tag -a v1.2.1 <good-commit> -m "Release v1.2.1" && git push origin v1.2.1`.
CI deploys that code.

Migrations are forward-only: rolling back the code does not undo a schema
change, so keep migrations backward compatible with the previous release. To
recover data, use D1 Time Travel, which restores the database to any minute in
the last 7 days on the free plan.
