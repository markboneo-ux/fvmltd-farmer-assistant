# FVMLTD Farmer Crop Assistant

Mobile-first web application shell for an AI crop assistant aimed at tropical smallholder farmers.

This first version is **visual structure only**: placeholder data, no authentication, no payments, and no connections to Supabase or OpenAI.

## Stack

- [Next.js](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Welcome page |
| `/register` | Farmer registration (placeholder form) |
| `/dashboard` | Farmer dashboard |
| `/crop-check` | Start a crop check |
| `/chat` | AI crop assistant chat (demo messages) |
| `/upload` | Upload crop photographs (placeholder states) |
| `/results` | Assessment results |
| `/staff` | Staff review dashboard |

## Project structure

```text
src/
  app/                  # Next.js App Router pages and global styles
    page.tsx            # Welcome
    register/           # Farmer registration
    dashboard/          # Farmer home
    crop-check/         # Crop selection + notes
    chat/               # Assistant conversation UI
    upload/             # Photo upload placeholders
    results/            # Assessment summary
    staff/              # Staff review queue
    layout.tsx          # Root layout, fonts, metadata
    globals.css         # Agricultural design tokens + motion
  components/           # Shared mobile UI building blocks
    AppShell.tsx
    BottomNav.tsx
    Button.tsx
    FieldIllustration.tsx
    StatusPill.tsx
  data/
    placeholder.ts      # Demo farmer, checks, chat, and staff data
public/                 # Static assets from the Next.js starter
```

## Design notes

- Layout is constrained to a phone-width column (`max-w-md`) for a mobile-first experience.
- Visual language uses canopy green, leaf accents, soft field gradients, and warm harvest yellow.
- Display type: Fraunces. Interface type: Figtree.
- Navigation between farmer screens uses a compact bottom nav on key pages.

## Getting started

```bash
npm install
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

## Out of scope (for this version)

- Supabase / databases
- OpenAI or other AI providers
- Authentication and authorization
- Payments
- Product recommendations

## Suggested next steps

1. Wire registration and dashboards to a real data store.
2. Add secure farmer and staff authentication.
3. Connect photo upload and chat to an AI assessment pipeline.
4. Add offline-friendly flows for low-connectivity field use.
