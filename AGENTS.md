<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Stack: Next.js 16 (App Router) + Supabase (Postgres/Storage/Auth) + OpenAI. Package manager is npm. Standard scripts live in `package.json` (`dev`, `build`, `start`, `lint`); there is no automated test suite. Standard setup is in `README.md`.

Local development uses a **local Supabase stack** run via the Supabase CLI + Docker (there are no hosted Supabase credentials in this environment). Docker and the Supabase CLI are pre-installed in the VM snapshot; `.env.local` points at the local stack with the standard local demo keys. On a fresh VM the daemon/stack may need to be (re)started:

- Start Docker if needed: `sudo dockerd` (run in a background tmux session). Docker uses the `fuse-overlayfs` storage driver with the containerd snapshotter disabled — see `/etc/docker/daemon.json`; don't change this or Docker-in-Docker breaks.
- Start Supabase: `sudo supabase start` (from repo root). This applies every migration in `supabase/migrations/` plus `supabase/seed.sql`.
- Get local keys: `sudo supabase status -o env` (already reflected in `.env.local`).
- Run the app: `npm run dev` (http://localhost:3000).

Non-obvious gotchas:

- A fresh local Supabase DB does NOT grant `SELECT/INSERT/UPDATE/DELETE` on `public` tables to the `anon`/`authenticated`/`service_role` roles — the repo migrations rely on the hosted platform for that. `supabase/seed.sql` re-applies those grants and runs automatically during `supabase start` on a fresh volume. If data writes start failing with `permission denied for table ...`, the seed did not run — re-apply it (`sudo docker exec -i supabase_db_workspace psql -U postgres -d postgres -f -` with the seed contents).
- `supabase db reset` fails with this CLI version ("Could not find the supabase-go binary"). To rebuild the DB from scratch use `sudo supabase stop --no-backup` then `sudo supabase start` instead (this re-runs migrations + seed).
- Farmer registration: `POST /api/farmers/register` calls the `register_farmer` RPC with a `p_primary_crops` argument while the SQL function parameter is `p_main_crops`, so the RPC path is skipped and the route uses its service-role fallback insert (works as long as the seed grants above are present). This is existing app behavior, not an environment problem.
- OpenAI: `OPENAI_API_KEY` is empty in `.env.local`. Only the preliminary AI assessment feature (`/api/crop-cases/[id]/complete` and `/assess`) needs it; registration, farms, crop-cycles, crop-check Q&A + photos, and staff review all work without it.
- Staff dashboard (`/staff`) requires a Supabase Auth user plus a matching `staff_profiles` row — see the "Staff Review Dashboard" section of `README.md`.
