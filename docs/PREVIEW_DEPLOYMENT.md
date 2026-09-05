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

Preview and Production **must not silently use different Supabase projects**.

Live debug from the nxmi Preview (`x-fvm-debug: 1`) returned:

- `persistenceMode=supabase`
- `missingSupabaseEnv=[]` (URL, anon key, and service role are all set)
- `supabaseHost=gcojtfrdjczrvzieynzj.supabase.co`

Production’s working project is `qzycpoivwwecooscnnju`. Preview is therefore **mis-scoped**, not missing variables.

Set these three on Vercel for **Preview** to the **same** project as Production (or migrate `crop_cases` / `case_messages` on the Preview project):

- `NEXT_PUBLIC_SUPABASE_URL` = `https://qzycpoivwwecooscnnju.supabase.co` (or the Preview branch DB that actually has `crop_cases`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` matching that project
- `SUPABASE_SERVICE_ROLE_KEY` matching that project

A core save writes `crop_cases` then `case_messages`. On `qzycpoivwwecooscnnju` the previous error was:

```
PGRST205 Could not find the table 'public.crop_cases' in the schema cache
```

Those tables, and later columns such as `business_metadata`, have now been created on `qzycpoivwwecooscnnju`.

The live nxmi Preview still pointed at `gcojtfrdjczrvzieynzj`. That project **has** `crop_cases`, but it is missing later columns from `20260904120000_general_assistant_trends.sql`. Exact Preview insert errors, in order:

```
PGRST204 Could not find the 'business_metadata' column of 'crop_cases' in the schema cache
PGRST204 Could not find the 'reviewed_at' column of 'crop_cases' in the schema cache
```

`gcojtfrdjczrvzieynzj` is missing later additive columns from `20260904120000_general_assistant_trends.sql` and `20260904180000_research_admin_review.sql`. PostgREST reports one missing column at a time. The app now retries `crop_cases` inserts/updates by dropping unknown optional columns (up to 48) so that schema can still return a `caseId`. Required columns (`id`, `farmer_problem_text`, `case_id`, `role`, `content`) are never dropped.

This is a compatibility shim, not a substitute for aligning Preview env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

must be enabled for **Preview** and should match Production (`qzycpoivwwecooscnnju`) or a Preview database that has the conversational schema and later columns.

GitHub **Supabase Preview** is skipped / `main` branching status is `MIGRATIONS_FAILED`, which is consistent with Preview using a stale or inaccessible branch project.

