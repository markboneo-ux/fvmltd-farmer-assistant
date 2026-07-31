# FVMLTD Farmer Crop Assistant

Mobile-first web application for an AI crop assistant aimed at tropical smallholder farmers.

This version includes the visual app shell, **Supabase client configuration**, the database schema, **farmer registration**, **farm / crop-cycle management**, and a **guided Crop Check** workflow for Tomato, Pepper, and Cucumber. OpenAI is not wired yet. Chat, upload, results, and staff screens still use placeholder data.

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
| `/dashboard` | Farmer dashboard with active crops |
| `/farms/new` | Add a farm plot |
| `/crop-cycles/new` | Create a crop cycle |
| `/crop-check` | Guided crop check (Tomato, Pepper, Cucumber) |
| `/chat` | AI crop assistant chat (demo messages) |
| `/upload` | Upload / review crop photographs for a case |
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
    farms/              # Farm form types and validation
    crop-cycles/        # Crop-cycle form types and validation
    crop-check/         # Guided crop-check steps and validation
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

## Farm and crop-cycle management

Registered farmers can:

1. **Add a farm** at `/farms/new` — country, district, farm size, GPS/manual location, water source, drainage condition, growing system  
2. **Create a crop cycle** at `/crop-cycles/new` — crop, variety, planting date, area planted, plant count (optional), open field / shade house / greenhouse, previous crop, current stage  

API routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` / `GET` | `/api/farms` | Create or list farms for a farmer |
| `POST` / `GET` | `/api/crop-cycles` | Create or list crop cycles (`status=active` for the dashboard) |

Active crop cycles appear on the Farmer Dashboard.

## Guided Crop Check

`/crop-check` walks the farmer through a **chat-style, one-question-at-a-time** workflow for:

- Tomato
- Pepper
- Cucumber

Flow:

1. Select the crop
2. Select an existing crop cycle **or** create a new one (inline)
3. Answer guided questions:
   - Problem description
   - Date first observed
   - Where symptoms began (young leaves, old leaves, fruit, stem, roots, whole plant)
   - Whether the problem is spreading
   - Percentage of the crop affected
   - Recent fertilizer applications
   - Recent spray applications
   - Irrigation frequency
   - Drainage condition
   - Recent heavy rainfall

Cases are saved to Supabase `crop_cases` as `draft` while in progress and `open` when complete. After the questions, farmers upload required photographs. AI diagnosis is intentionally not included yet.

### Crop Check photographs

Required slots (skippable, but clearly marked when missing):

1. Whole field or crop area  
2. Whole affected plant  
3. Front of affected leaf  
4. Back of affected leaf  
5. Stem, fruit, root, insect or damaged area  
6. Healthy comparison plant  

Photos are compressed on-device when practical, stored in a **private** Supabase Storage bucket (`case-photos`), and recorded in `case_photos`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` / `GET` | `/api/crop-cases` | Start / list crop check cases |
| `PATCH` / `GET` | `/api/crop-cases/[id]` | Save the next guided answer / load a case |
| `POST` / `GET` | `/api/crop-cases/[id]/photos` | Upload / list case photographs |
| `POST` | `/api/crop-cases/[id]/photos/skip` | Skip a required photograph slot |
| `POST` | `/api/crop-cases/[id]/complete` | Finish check (auto-marks remaining gaps as skipped) |

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
| `20260731180000_initial_schema.sql` | Core tables including `farmers`, `farms`, `crop_cycles` |
| `20260731190000_farmer_registration_fields.sql` | Adds Farmer ID / farm size / crops / consent columns if upgrading an older schema |
| `20260731193000_farm_crop_cycle_fields.sql` | Adds farm location/water/drainage/system and crop-cycle planting fields |
| `20260731200000_crop_check_guided_fields.sql` | Adds guided crop-check fields and `draft` status on `crop_cases` |
| `20260731210000_case_photo_slots_and_storage.sql` | Photo slot keys, skip support, private `case-photos` Storage bucket |

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
