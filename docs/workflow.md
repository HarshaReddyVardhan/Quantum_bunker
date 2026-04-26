# Branch Map & CI/CD Workflow

## Branch Map
- `main` → prod 
- `staging` → pre-prod / smoke 
- `develop` → daily dev 
- `feature/*` → every task, fix, PR 

Creation order:
- `develop` from `main`
- `staging` from `main`
- each `feature/<name>` from `develop`

## Merge Flow
- `feature/*` → `develop`
- `develop` → `staging`
- `staging` → `main`

## GitHub Setup

### Rulesets
- Target branches: `main`, `staging`, `develop`
- `main`
  - Require PR
  - Require status checks
  - Require conversation resolution
  - Block force pushes
  - Block deletion
  - Require linear history
- `staging`
  - Require PR
  - Require status checks
  - Require conversation resolution
  - Block force pushes
  - Block deletion
- `develop`
  - Require PR
  - Require status checks
  - Block force pushes
  - Block deletion

### Environments
- `staging` env → allow only `staging` branch
- `production` env → allow only `main` branch

## CI Jobs
- `ci-quick` → install, lint, typecheck, unit tests
- `ci-integration` → HTTP route tests, WS adapter tests, store tests, expiry/reconnect behavior
- `ci-e2e-relay` → create session, 2 peers connect, send/receive chat, full-session reject, expired-session reject
- `ci-smoke` → app boots, `/health` works, create session succeeds
- `deploy` → deploy `staging` from `staging`; deploy `production` from `main` via Environment gates

## Branch to Jobs
- `feature/*` PR to `develop` → `ci-quick`
- `develop` → `ci-quick` + `ci-integration`
- `staging` → `ci-quick` + `ci-integration` + `ci-e2e-relay` + `ci-smoke`
- `main` → all 4, then prod deploy

## Required Checks
- `develop`: `ci-quick`, `ci-integration`
- `staging`: `ci-quick`, `ci-integration`, `ci-e2e-relay`, `ci-smoke`
- `main`: `ci-quick`, `ci-integration`, `ci-e2e-relay`, `ci-smoke`

## Reviews
- Solo dev: require PR, review count `0`
- Community devs: require `1` approving review on `main` + `staging`

## Deployments
- Treat free hosting (like Render free tier) as demo/staging since they spin down after 15 min idle.
