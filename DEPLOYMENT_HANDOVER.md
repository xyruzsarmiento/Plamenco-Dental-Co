# Deployment Handover

## Repository
Repository: `xyruzsarmiento/Plamenco-Dental-Co`
Production integration branch: `main`.

## Build commands
Use only scripts defined in `package.json`:
- `npm run build`
- `npm run lint`
- `npm run verify:schema`
- `npm run verify:deployment`

Do not document a command as passing unless it was actually executed successfully.

## Deployment platform
The project is deployed through Vercel. Production domain, environment assignment and redirect configuration must be verified in the live project before launch.

## Supabase
Apply migrations in repository order. Prefer a new forward repair migration over casually rewriting an already-applied migration. Keep service-role credentials server-side only.

## Environment categories
Frontend may receive only intended public configuration such as the Supabase URL/anon key. Payment, email, SMS, Messenger and service-role secrets belong only in protected server/provider environments.

## Rollback
For frontend regressions, redeploy a known-good commit. For database changes, use a reviewed forward repair migration unless a validated rollback exists. Never perform destructive rollback operations against production data without backup/restore evidence and explicit approval.

## Release state
Current release identifier is `1.0.0-rc.1`. Promote to `1.0.0` only after acceptance and production verification.
