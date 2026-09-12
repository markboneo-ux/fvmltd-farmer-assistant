# Preview vs main vs production

Live testing must use the **pull-request Preview** deployment, not `git-main` and not production.

## Exact Preview URL pattern

Vercel Preview URLs for this repo look like:

```
https://fvmltd-farmer-assistant-nxmi-git-<branch-slug>-fvmltd.vercel.app
```

There is a second Vercel project, `fvmltd-farmer-assistant`, with the same `git-<branch-slug>` pattern. Use the **Preview** link on the pull request’s Vercel comment.

Vercel shortens the git branch name. Example for PR #32 branch `cursor/caribbean-adaptive-assistant-1f94`:

```
https://fvmltd-farmer-assistant-nxmi-git-cursor-caribbean-723cc2-fvmltd.vercel.app
```

This refinement branch (`cursor/pesticide-research-continuity-bb73`) will get its own Preview URL after Vercel deploys, of the form:

```
https://fvmltd-farmer-assistant-nxmi-git-cursor-pesticide-*-fvmltd.vercel.app
```

## How to tell Preview from main / production

| Deployment | How to recognise it |
| --- | --- |
| **PR Preview** | URL contains `git-cursor-` (or another `git-<feature-branch>` slug). GitHub PR → Vercel Preview comment. SHA matches the **PR head commit**. |
| **Main Preview** | URL contains **`git-main`**. This is `main`, not the PR. Do not use it as proof the PR works. |
| **Production** | Custom domain (`crop.farmersvaluemart.com` or `farmersvaluemart.com/crop-solution`) or a Vercel environment labelled **Production**. |

## Which commit is deployed

1. Open the pull request.
2. Open the Vercel Preview comment / deployment.
3. Confirm the git SHA equals the PR head commit (not the latest `main` SHA).

Do **not** treat a `git-main` chat result as evidence that the pull-request code is working.

## Preview persistence

Vercel Preview (`nxmi`) currently uses a **different Supabase project** from Production. Do **not** retarget Preview at Production automatically. Align the Preview schema instead.

| | Host |
| --- | --- |
| **Preview** | `gcojtfrdjczrvzieynzj.supabase.co` |
| **Production** | `qzycpoivwwecooscnnju.supabase.co` |

Preview env vars are present (`missingSupabaseEnv=[]`). They are pointed at the older project (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for Preview). Do not change them to Production as part of this alignment.

### Missing Preview migrations

Production `supabase_migrations.schema_migrations` previously recorded files only through `20260805180100_weather_disease_risk`. The September conversational migrations had been applied to Production via SQL but were not recorded. Those versions are now recorded on Production. Preview (`gcojtfrdjczrvzieynzj`) still has `crop_cases` / `case_messages` from the controlled-beta baseline and is missing the later additive columns.

Live Preview insert errors before alignment, in order:

```
PGRST204 Could not find the 'business_metadata' column of 'crop_cases' in the schema cache
PGRST204 Could not find the 'reviewed_at' column of 'crop_cases' in the schema cache
```

Apply these files, in order, on the **Preview** project. All are additive (`IF NOT EXISTS`). Do not drop tables.

1. `20260903135000_staff_profiles_auth_user_id.sql`
2. `20260903140000_controlled_beta.sql` (already present on Preview if `crop_cases` exists)
3. `20260904120000_general_assistant_trends.sql` — adds `business_metadata` and related columns
4. `20260904180000_research_admin_review.sql` — adds `reviewed_at` and review flags
5. `20260905120000_country_research_staff_review.sql` — adds `include_in_trend_learning` and research tables
6. `20260905180000_drop_farmer_country_trinidad_default.sql`
7. `20260905190000_crop_cases_service_role_grants.sql`
8. `20260905200000_align_preview_conversational_schema.sql` — **one-shot catch-up** covering the columns/tables above

If you only run one script on Preview, run **`supabase/migrations/20260905200000_align_preview_conversational_schema.sql`** in the SQL editor for `gcojtfrdjczrvzieynzj`, then `NOTIFY pgrst, 'reload schema';` (already at the end of that file).

Required `crop_cases` columns after alignment: `business_metadata`, `reviewed_at`, `reviewed_by`, `review_notes`, `conversation_intent`, `question_category`, `calculation_type`, `case_type`, `knowledge_state`, `diagnosis_incorrect`, `needs_review`, `useful_for_trend`, `exclude_from_learning`, `include_in_trend_learning`.

Required `case_messages` extra columns: `conversation_intent`, `question_category`.

This agent **cannot** apply SQL to `gcojtfrdjczrvzieynzj` (Management API 403; the access token only sees Production `qzycpoivwwecooscnnju`).

### Preview staff login (`staff_lookup_failed`)

`/admin/login` authenticates against **this** Preview project, then reads `staff_profiles` with the server service-role client. A live Preview failure of `staff_lookup_failed · gcojtfrdjczrvzieynzj.supabase.co · preview` was reproduced after deploy:

- Auth user `info@fvmltd.com` **exists** in `gcojtfrdjczrvzieynzj`.
- Vercel `SUPABASE_SERVICE_ROLE_KEY` JWT `ref` **matches** that project (not Production).
- `staff_profiles` query failed with `column staff_profiles.email does not exist`.

The app now retries the lookup without optional columns. Still run **`docs/preview-staff-mapping.sql`** in the SQL editor for `gcojtfrdjczrvzieynzj` so the Preview table has `email` / `auth_user_id` / `is_active` and a mapped staff row. Do **not** copy a Production `auth.users.id`.

1. Grants `staff_profiles` to `service_role` / `authenticated` and reloads PostgREST.
2. Looks up `info@fvmltd.com` in **this** project's `auth.users`.
3. Upserts an active `staff_profiles` row whose `auth_user_id` equals that Auth UUID.

Also confirm Vercel Preview `SUPABASE_SERVICE_ROLE_KEY` is the service-role key for `gcojtfrdjczrvzieynzj`, not Production. After deploy, `GET /api/staff/preview-diagnostics` with header `x-fvm-debug: 1` reports whether the Auth user, staff row, grants, and JWT `ref` match — still against Preview, never Production.

### Preview dashboard insights (`Insights are temporarily unavailable`)

Cases (`GET /api/admin/cases` → `crop_cases`) can succeed while Overview fails. `/api/admin/insights` also reads `case_messages`, `case_photos`, `case_followups`, `case_outcomes`, `case_trends`, `usage_events`, `web_research_events`, `trusted_sources`, and `farmer_profiles`. A missing table or `service_role` grant on any of those used to 503 the whole Overview.

The app now keeps Overview up from `crop_cases`, records each optional table failure in Vercel logs (`database_failure`) and in the JSON `warnings` array, and only 503s when `crop_cases` itself cannot be read. Crop-check queue (`/staff`) retries without the nested `farmer_profiles!inner` embed if PostgREST cannot find that relationship.

Still run **`docs/preview-dashboard-tables.sql`** on `gcojtfrdjczrvzieynzj` so the optional tables/grants exist. Live Preview probes after this deploy showed:

- Present: `crop_cases`, `case_messages`, `case_photos`, `case_followups`, `case_outcomes`, `farmer_profiles`, `usage_events`
- Missing from PostgREST: `case_trends`, `web_research_events`, `trusted_sources`, `crop_checks`, `farms`, `crop_cycles`, `assessment_results`

That missing `case_trends` table is why Overview 503'd while Cases still worked. After deploy, Overview loads from `crop_cases` and lists remaining table errors as warnings until the SQL is applied. Do not retarget Preview at Production.

### Compatibility shim

The app still retries unknown optional columns if PostgREST returns `PGRST204`. That is defensive only. After Preview is aligned, `x-fvm-debug: 1` must return `schemaCompatUsed=false` and `schemaCompatDroppedColumns=[]`.

### GitHub Supabase Preview (`skipped` / `MIGRATIONS_FAILED`)

The GitHub check **Supabase Preview** is skipped with:

> This git branch is not associated with any Supabase Branch. You can open a PR to create a new branch.

That check is tied to Production `qzycpoivwwecooscnnju`, not `gcojtfrdjczrvzieynzj`. Creating a GitHub-linked Preview branch from this token returned:

```
402 Branching is supported only on the Pro plan or above
```

The leftover `git_branch=main` record has been `MIGRATIONS_FAILED` since 2026-07-31. September conversational SQL was also applied to Production outside `schema_migrations`; those versions have now been recorded on Production.

GitHub **cannot** attach a PR database until the org is on a plan that includes branching. Until then, align `gcojtfrdjczrvzieynzj` with the SQL above rather than pointing Vercel Preview at Production.

