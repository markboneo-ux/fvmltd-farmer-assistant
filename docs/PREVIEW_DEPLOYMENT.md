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
