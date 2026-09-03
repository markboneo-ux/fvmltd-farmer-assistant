# Controlled web beta

See also:

- [Website / custom domain](./VERCEL_DOMAIN.md)
- [Maintenance](./MAINTENANCE.md)
- [Beta tester plan](./BETA_TESTER_PLAN.md)

## Journey

Guest → registered free → free usage limit → upgrade or promotional code → continued access.

The promotional code `FVM` is stored and validated only on the server. It is not a client-side bypass.

## Additive database migration

`supabase/migrations/20260903140000_controlled_beta.sql`

Do not push this migration to production from the pull request. Apply it manually in a preview or staging project first.

## Farmer interface rules

The normal chat does not show developer lab, diagnostics, model names, timing, API codes, or raw JSON. Those remain on `/ai-lab`.
