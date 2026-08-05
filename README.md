# FVMLTD Farmer Crop Assistant

Mobile-first web application for an AI crop assistant aimed at tropical smallholder farmers.

This version includes an **AI-first guest chat** on the homepage (no registration required), plus the visual app shell, **Supabase**, **farmer registration**, **farm / crop-cycle management**, a **guided Crop Check** (with photographs), a **server-side OpenAI preliminary assessment**, and a **secure FVMLTD Staff Review Dashboard**.

## Stack

- [Next.js](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (Postgres + Storage + Auth-ready clients)
- [OpenAI](https://openai.com/) (server-only guest chat + preliminary assessments)

## Pages

| Route | Purpose |
| --- | --- |
| `/` | AI Farmer Assistant chat (guest — no signup) |
| `/register` | Farmer registration (validated form → Supabase) |
| `/dashboard` | Farmer dashboard with active crops |
| `/farms/new` | Add a farm plot |
| `/crop-cycles/new` | Create a crop cycle |
| `/crop-check` | Guided crop check (Tomato, Pepper, Cucumber) |
| `/chat` | Same guest AI chat as homepage |
| `/upload` | Upload / review crop photographs for a case |
| `/results` | Preliminary AI assessment results (`?caseId=`) |
| `/staff/login` | FVMLTD staff authentication (Supabase Auth) |
| `/staff` | Secure staff review queue (new / urgent / awaiting review) |
| `/staff/cases/[id]` | Staff case review detail + actions |

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
    assessment/         # OpenAI preliminary assessment (server-only)
    ai/                 # Guest AI chat (Responses API, no Supabase)
    staff/              # Staff auth, queue queries, assessment review maps
    openai/             # OpenAI client + env helpers (server-only)
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

On submit, `POST /api/farmers/register` validates the payload and inserts a row into the Supabase `farmer_profiles` table by calling the `register_farmer` SECURITY DEFINER RPC with the **anon** key (so registration works under RLS without exposing the service-role key). If that migration is not applied yet, the route falls back to a server-only service-role insert. A unique Farmer ID (`FVM-XXXXXX`) is generated. After success, the farmer is sent to `/dashboard`, which shows their name, Farmer ID, location, farm size, and crops.

Country options are Caribbean-focused (default: Trinidad and Tobago) and live in `src/data/countries.ts`.

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

Cases are saved to Supabase `crop_checks` as `draft` while in progress and `open` when complete. After the questions, farmers upload required photographs. AI diagnosis is intentionally not included yet.

### Crop Check photographs

Required slots (skippable, but clearly marked when missing):

1. Whole field or crop area  
2. Whole affected plant  
3. Front of affected leaf  
4. Back of affected leaf  
5. Stem, fruit, root, insect or damaged area  
6. Healthy comparison plant  

Photos are compressed on-device when practical, stored in a **private** Supabase Storage bucket (`case-photos`), and recorded in `crop_photos`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` / `GET` | `/api/crop-cases` | Start / list crop check cases |
| `PATCH` / `GET` | `/api/crop-cases/[id]` | Save the next guided answer / load a case |
| `POST` / `GET` | `/api/crop-cases/[id]/photos` | Upload / list case photographs |
| `POST` | `/api/crop-cases/[id]/photos/skip` | Skip a required photograph slot |
| `POST` | `/api/crop-cases/[id]/complete` | Finish check, then run preliminary OpenAI assessment |
| `POST` / `GET` | `/api/crop-cases/[id]/assess` | Run / load preliminary assessment |

## Guest AI chat (no registration)

The homepage (`/`) and `/chat` open a ChatGPT-style Farmer Assistant immediately.

- No Farmer ID, WhatsApp number, farm, crop cycle, or Supabase auth is required
- `POST /api/ai/chat` calls the OpenAI **Responses API** with a server-only `OPENAI_API_KEY`
- Optional profile link: “Create a farmer profile” → `/register`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/ai/chat` | Guest farming Q&A (OpenAI Responses API) |

## Preliminary OpenAI assessment

When a crop check is completed, **server-only** code calls OpenAI with case context:

- Crop, variety, crop age, location
- Problem description, symptom location, affected area
- Fertilizer / spray history, irrigation, drainage
- Soil pH and EC when a `soil_tests` row exists
- Uploaded crop photographs (downloaded server-side from private Storage)

The model must return structured JSON:

`case_summary`, `likely_causes`, `confidence_score`, `missing_information`, `immediate_safe_actions`, `human_review_required`, `laboratory_test_needed`, `product_recommendation_allowed`, `urgency_level`, `safety_signals`

### Confidence bands

| Confidence | Farmer-facing outcome |
| --- | --- |
| **≥ 80%** | Display approved preliminary guidance |
| **60–79%** | Ask for missing information or additional photographs |
| **< 60%** | Send the case for human technical review |

### Automatic human review

Human review is required automatically when any of these apply:

- Most of the crop is affected (≥ 50%)
- Plants are dying quickly
- Unknown products were mixed
- Herbicide damage is suspected
- Multiple unsuccessful treatments were already applied
- The AI identifies a possible severe bacterial or viral issue
- No approved protocol exists

When human review is required, the case status becomes `in_review`, a staff follow-up is created, and **no final product recommendation is displayed**.

### Safety controls

- OpenAI is only used from Route Handlers under `src/lib/openai` and `src/lib/assessment` (`server-only`)
- Prompt forbids unrestricted pesticide rates and invented products
- `product_recommendation_allowed` stays `false` when human review is required
- Immediate actions are sanitized to strip rate-like patterns
- Results are stored in Supabase `assessment_results`

## Supabase setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key

### 2. Apply the database migrations

Canonical schema uses the **existing production table names**:

`farmer_profiles`, `farms`, `crop_checks`, `crop_photos`, `chat_messages`, `assessment_results`, `staff_profiles`

plus extensions `crop_cycles`, `soil_tests`, `follow_ups`, `lab_test_requests`, `products`, `recommendations`.

The baseline migration is **idempotent** (`create table if not exists`, `add column if not exists`, conditional constraints/policies). It is safe for:

- an existing production database whose core tables already exist
- a clean preview / development database with no tables

Run migrations in filename order:

- Supabase Dashboard → **SQL Editor** → paste and run each file, or
- with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` then `supabase db push`

| Migration | Purpose |
| --- | --- |
| `20260731180000_initial_schema.sql` | Idempotent canonical baseline (production table names + app extensions) |
| `20260731190000` … `20260731230000` | No-ops kept for stable timestamps (folded into the baseline) |
| `20260803140000_farmer_registration_rpc_and_country.sql` | `register_farmer` RPC → `farmer_profiles` + TT country default |

#### Production migration history repair (required if history is empty)

If the production Supabase project already has the core tables but the **migration history page shows no migrations**, Preview/CI will try to re-apply the chain and previously failed with `relation "farms" already exists`.

Because the rewritten baseline is idempotent, you can either:

**Option A — push the idempotent chain (recommended when history is empty)**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This runs every migration. Existing tables are left in place; missing columns/functions are added. No data is dropped.

**Option B — mark the baseline as already applied, then push only the RPC**

Use this if you prefer not to re-run the baseline SQL on production after manually confirming the schema already matches:

```bash
supabase link --project-ref <your-project-ref>
supabase migration repair --status applied 20260731180000
supabase migration repair --status applied 20260731190000
supabase migration repair --status applied 20260731193000
supabase migration repair --status applied 20260731200000
supabase migration repair --status applied 20260731210000
supabase migration repair --status applied 20260731220000
supabase migration repair --status applied 20260731230000
supabase db push
```

After Option B, the migration that still needs to run is:

`20260803140000_farmer_registration_rpc_and_country.sql`

(unless you already applied it). That migration creates/replaces `public.register_farmer` against `farmer_profiles`.

Do **not** assume these repair commands have already been run.

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
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **Yes** | Service role key. **Never** prefix with `NEXT_PUBLIC_`. Bypass RLS — use only in trusted server code (`src/lib/supabase/admin.ts`). Still used for farms/crop-check/staff admin paths; **not required for farmer registration** once `register_farmer` is applied. |
| `OPENAI_API_KEY` | Server only | **Yes** | OpenAI API key. **Never** prefix with `NEXT_PUBLIC_`. Used by guest chat (`/api/ai/chat`) and assessment routes. |
| `OPENAI_MODEL` | Server only | No | Optional. Defaults to `gpt-4o`. |

No **new** Vercel variable name is required beyond `OPENAI_API_KEY` / optional `OPENAI_MODEL` already listed above — ensure they are set for Production and Preview.

Recommended Vercel settings for each variable:

- Environments: Production, Preview, and Development (as needed)
- For `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY`, mark as **Sensitive** / encrypted if your Vercel plan supports it

### Security notes

- Browser code (`src/lib/supabase/client.ts`) uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The service role client lives in `src/lib/supabase/admin.ts` and imports `server-only` so it cannot be bundled into the browser.
- The OpenAI client lives in `src/lib/openai/client.ts` with `server-only` — never call OpenAI from Client Components.
- RLS is enabled on application tables. Farmer registration uses the `register_farmer` SECURITY DEFINER RPC with the anon key. Other trusted writes continue to use the server admin client.

## Canonical database tables

| Table | Purpose |
| --- | --- |
| `farmer_profiles` | Canonical farmer records (registration + profile) |
| `farms` | Farm plots belonging to farmers |
| `crop_cycles` | Planting seasons / crop cycles |
| `crop_checks` | Guided crop health checks |
| `crop_photos` | Photos attached to crop checks (Storage paths) |
| `chat_messages` | Farmer chat + staff review messages |
| `assessment_results` | Preliminary OpenAI / staff assessment records |
| `soil_tests` | Soil test results |
| `recommendations` | Case recommendations, optional product link |
| `products` | Product catalog |
| `follow_ups` | Follow-up tasks for staff / farmers |
| `lab_test_requests` | Staff soil / laboratory test requests |
| `staff_profiles` | FVMLTD staff accounts |

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
- Visual language uses FVMLTD green, white backgrounds, and dark charcoal text.
- Display type: Fraunces. Interface type: Figtree.
- Public homepage tagline: Farming Forward.
- Navigation between farmer screens uses a compact bottom nav on key pages.

## Staff Review Dashboard

Only **authenticated FVMLTD staff** can access `/staff` and `/api/staff/*`.

### Access setup

1. Apply migration `20260803140000_farmer_registration_rpc_and_country.sql` (and the canonical baseline if needed).
2. In Supabase Auth, create a staff user (email + password).
3. Insert a matching `staff_profiles` row:

```sql
insert into public.staff_profiles (auth_user_id, full_name, email, role, is_active)
values (
  '<auth-user-uuid>',
  'Ada Agronomist',
  'ada@fvmltd.example',
  'agronomist',
  true
);
```

4. Sign in at `/staff/login`.

Middleware requires a Supabase Auth session for staff routes. Handlers then verify an **active** `staff_profiles` row linked to `auth.users.id` via `auth_user_id` (or legacy `id = auth.uid()`).

### Queue views

- **New cases** — `crop_checks.status = open`
- **Urgent cases** — staff `is_urgent` flag or AI urgency `high` / `critical`
- **Awaiting review** — `in_review` or `awaiting_info`

### Case detail shows

Farmer details, farm location, crop/variety, photographs (signed URLs), soil results, fertilizer/spray history, AI assessment, confidence score, and missing information.

### Staff actions

| Action | Effect |
| --- | --- |
| Approve assessment | Marks assessment approved; case `resolved` |
| Edit assessment | Saves staff overrides; case `resolved` |
| Ask farmer another question | Creates `chat_messages` row; case `awaiting_info` |
| Request soil test | Creates `lab_test_requests` (`soil`) + follow-up |
| Request laboratory test | Creates `lab_test_requests` (`laboratory`) + follow-up |
| Mark urgent | Sets `crop_checks.is_urgent` |
| Close case | Sets status `closed` with optional reason |

Staff API routes (all require staff auth):

| Method | Path |
| --- | --- |
| `GET` | `/api/staff/me` |
| `GET` | `/api/staff/cases?filter=new\|urgent\|in_review\|all` |
| `GET` | `/api/staff/cases/[id]` |
| `POST` | `/api/staff/cases/[id]/approve` |
| `PATCH` | `/api/staff/cases/[id]/assessment` |
| `POST` | `/api/staff/cases/[id]/ask` |
| `POST` | `/api/staff/cases/[id]/request-test` |
| `POST` | `/api/staff/cases/[id]/urgent` |
| `POST` | `/api/staff/cases/[id]/close` |

## Out of scope (for this version)

- Farmer authentication (farmers still use local session + `farmerId`)
- Payments
- Catalog-backed product recommendations (AI product recommendations stay disabled unless staff approves)
- Farmer reply UI for staff questions (messages are stored; farmer chat reply comes later)

## Suggested next steps

1. Add Supabase Auth for farmers; expand RLS policies beyond staff self-select.
2. Let farmers answer staff questions from the assistant chat.
3. Collect soil pH/EC in the crop-check flow when available.
