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

