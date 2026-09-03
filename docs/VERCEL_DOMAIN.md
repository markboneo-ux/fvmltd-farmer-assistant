# Website and custom-domain configuration

FVM Crop Solution is a standalone Next.js app. Do **not** embed it in an iframe.

It can be launched from the Farmersvaluemart website as:

- `https://farmersvaluemart.com/crop-solution`
- `https://crop.farmersvaluemart.com`

Internal routes are relative (`/`, `/signin`, `/api/ai/case`). Do not hardcode `*.vercel.app` URLs.

## Required Vercel settings after merge

1. **Project → Settings → Domains**
   - Add `crop.farmersvaluemart.com` **or** keep the app on the existing Vercel host and reverse-proxy `/crop-solution` from the main site.
   - Point the DNS CNAME to the Vercel target Vercel shows for that domain.
2. **Environment variables** (Production and Preview):

   | Variable | Example | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_APP_URL` | `https://crop.farmersvaluemart.com` | Canonical origin. Used for auth callbacks. |
   | `NEXT_PUBLIC_MAIN_WEBSITE_URL` | `https://farmersvaluemart.com` | Header “Farmersvaluemart” return link. |
   | `NEXT_PUBLIC_BASE_PATH` | empty **or** `/crop-solution` | Set only if the app is mounted under a path. Rebuild after changing. |
   | `NEXT_PUBLIC_SUPABASE_URL` | existing project | Already in use. |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | existing project | Already in use. |
   | `SUPABASE_SERVICE_ROLE_KEY` | existing secret | Server only. |
   | `OPENAI_API_KEY` | existing secret | Server only. |
   | `OPENAI_MODEL` | `gpt-4o` | Optional. |
   | `FVM_GUEST_MAX_*` / `FVM_REGISTERED_FREE_*` | see `.env.example` | Optional overrides. |

3. **Supabase Auth → URL configuration**
   - Site URL: the same value as `NEXT_PUBLIC_APP_URL`.
   - Redirect allow list:
     - `https://crop.farmersvaluemart.com/auth/callback`
     - `https://farmersvaluemart.com/crop-solution/auth/callback` (if using `BASE_PATH`)
     - current Vercel preview URLs, if preview auth is needed
4. **Cookies / sessions**
   - Auth cookies are `SameSite=Lax` and `Secure` in production.
   - Guest identity uses the `fvm_guest_session` httpOnly cookie on the app origin.
   - If the main website and the app are on different origins, do not share cookies across them. The header link is a normal navigation.
5. **Main website navigation**
   - Add a nav item **FVM Crop Solution** that opens the app in the same tab (`https://crop.farmersvaluemart.com` or `/crop-solution`).
   - Do not iframe the app.

## Path vs subdomain

| Option | When to use | Vercel | Next.js |
| --- | --- | --- | --- |
| Subdomain `crop.farmersvaluemart.com` | Preferred | Attach custom domain | Leave `NEXT_PUBLIC_BASE_PATH` empty |
| Path `/crop-solution` | If marketing site must keep one host | Rewrite `/crop-solution` to this project **or** set `NEXT_PUBLIC_BASE_PATH=/crop-solution` and rebuild | Relative routes still work |

Authentication callbacks, image uploads, and cookies must stay on the app origin.
