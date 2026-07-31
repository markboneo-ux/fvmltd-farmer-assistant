# FVMLTD Farmer Crop Assistant

Mobile-first web application for an AI crop assistant aimed at tropical smallholder farmers.

This version includes the visual app shell, **Supabase client configuration**, the initial database schema, and a working **farmer registration** flow that saves profiles to Supabase. OpenAI is not wired yet. Most other UI screens still use placeholder data until authentication and live queries are connected.

## Stack

- [Next.js](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Postgres + Auth-ready clients)

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Welcome page |
| `/register` | Farmer registration (validated form → Supabase) |
| `/dashboard` | Farmer dashboard (shows registered farmer when available) |
| `/crop-check` | Start a crop check |
| `/chat` | AI crop assistant chat (demo messages) |
| `/upload` | Upload crop photographs (placeholder states) |
| `/results` | Assessment results |
| `/staff` | Staff review dashboard |

## Project structure

```text
src/
  app/                  # Next.js App Router pages, API routes, global styles
  components/           # Shared mobile UI building blocks
  data/
    placeholder.ts      # Demo farmer, checks, chat, and staff data
  lib/
    farmers/            # Registration validation, Farmer ID, local session
    supabase/
      client.ts         # Browser client (anon key only)
      server.ts         # Server client (anon key + cookies)
      admin.ts          # Service-role client (server-only)
      env.ts            # Environment variable helpers
supabase/
  migrations/           # SQL migrations for the schema
.env.example            # Template for required environment variables
```

## Farmer registration

The `/register` page collects:

- Full name
- WhatsApp number
- Country
- District or region
- Farm size and preferred unit (acres or hectares)
- Main crops
- Consent to store farm information and crop photographs

On submit, `POST /api/farmers/register` validates the payload, generates a unique Farmer ID (`FVM-XXXXXX`), and inserts a row into the Supabase `farmers` table using the **service role** client (RLS is enabled with no public insert policy yet). After success, the farmer is sent to `/dashboard`, which shows their name, Farmer ID, location, farm size, and crops.

## Supabase setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key

### 2. Apply the database migration

Run the SQL migrations in `supabase/migrations/` against your project **in filename order**, either:

- Supabase Dashboard → **SQL Editor** → paste and run each file, or
- with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` then `supabase db push`

| Migration | Purpose |
| --- | --- |
| `20260731180000_initial_schema.sql` | Core tables including `farmers` |
| `20260731190000_farmer_registration_fields.sql` | Adds Farmer ID / farm size / crops / consent columns if upgrading an older schema |

### 3. Local environment variables

```bash
cp .env.example .env.local
```

Fill in the three values from your Supabase project (see table below).

### 4. Environment variables for Vercel

In the Vercel project: **Settings → Environment Variables**, add:

| Variable | Where it is used | Secret? | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No | Supabase project URL. Safe to expose; required at build and runtime. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | No | Public anon key. Safe for Client Components. Protected by Row Level Security. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **Yes** | Service role key. **Never** prefix with `NEXT_PUBLIC_`. Bypass RLS — use only in trusted server code (`src/lib/supabase/admin.ts`). |

Recommended Vercel settings for each variable:

- Environments: Production, Preview, and Development (as needed)
- For `SUPABASE_SERVICE_ROLE_KEY`, mark as **Sensitive** / encrypted if your Vercel plan supports it

Do **not** add OpenAI keys yet — AI integration is intentionally out of scope for this step.

### Security notes

- Browser code (`src/lib/supabase/client.ts`) uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The service role client lives in `src/lib/supabase/admin.ts` and imports `server-only` so it cannot be bundled into the browser.
- Initial RLS is enabled on all application tables with no public policies yet. Until auth policies are added, prefer the server admin client for trusted backend writes.

## Initial database tables

| Table | Purpose |
| --- | --- |
| `farmers` | Farmer profiles |
| `farms` | Farm plots belonging to farmers |
| `crop_cycles` | Planting seasons / crop cycles |
| `crop_cases` | Crop health check cases |
| `case_photos` | Photos attached to cases (Storage paths) |
| `soil_tests` | Soil test results |
| `ai_assessments` | AI assessment records (no OpenAI yet) |
| `recommendations` | Case recommendations, optional product link |
| `products` | Product catalog |
| `follow_ups` | Follow-up tasks for staff / farmers |
| `staff_users` | FVMLTD staff accounts |

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in Supabase values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Design notes

- Layout is constrained to a phone-width column (`max-w-md`) for a mobile-first experience.
- Visual language uses canopy green, leaf accents, soft field gradients, and warm harvest yellow.
- Display type: Fraunces. Interface type: Figtree.
- Navigation between farmer screens uses a compact bottom nav on key pages.

## Out of scope (for this version)

- OpenAI or other AI providers
- Authentication and authorization policies
- Payments
- Live data binding on crop-check / chat / upload / results / staff screens (still placeholder)

## Suggested next steps

1. Add Supabase Auth for farmers and staff; write RLS policies.
2. Replace remaining placeholder screens with queries against the new tables.
3. Connect photo upload to a Supabase Storage bucket (`case-photos`).
4. Add OpenAI (or another model) for `ai_assessments` generation.
