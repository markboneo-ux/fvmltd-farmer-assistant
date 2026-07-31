import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { farmer, recentChecks } from "@/data/placeholder";

const severityTone = {
  low: "low",
  mild: "mild",
  moderate: "moderate",
} as const;

export default function DashboardPage() {
  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.14em] text-leaf uppercase">
              FVMLTD
            </p>
            <Link
              href="/staff"
              className="text-xs font-medium text-muted underline-offset-2 hover:text-canopy hover:underline"
            >
              Staff view
            </Link>
          </div>
          <p className="text-sm text-muted">Good morning,</p>
          <h1 className="font-display text-3xl font-semibold text-ink">{farmer.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {farmer.village} · {farmer.farmSize}
          </p>
        </header>

        <section className="animate-rise-delay mb-6 rounded-2xl bg-canopy px-4 py-5 text-white">
          <p className="text-xs font-semibold tracking-[0.12em] text-mint uppercase">
            Next action
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold">Check a crop today</h2>
          <p className="mt-1.5 text-sm text-white/85">
            Capture plant photos and get guidance before issues spread across the plot.
          </p>
          <div className="mt-4">
            <Button href="/crop-check" className="bg-sun text-soil hover:bg-[#f0c25d]">
              Start crop check
            </Button>
          </div>
        </section>

        <section className="animate-rise-late mb-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Recent checks</h2>
            <Link href="/results" className="text-xs font-semibold text-leaf">
              See all
            </Link>
          </div>
          <ul className="space-y-3">
            {recentChecks.map((check) => (
              <li key={check.id}>
                <Link
                  href="/results"
                  className="block rounded-2xl bg-surface/90 px-4 py-3 ring-1 ring-line transition hover:ring-leaf-bright"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{check.crop}</p>
                      <p className="mt-0.5 text-xs text-muted">{check.date}</p>
                    </div>
                    <StatusPill
                      label={check.status}
                      tone={severityTone[check.severity]}
                    />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{check.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3">
          <Link
            href="/chat"
            className="rounded-2xl bg-surface px-3 py-4 ring-1 ring-line transition hover:ring-leaf-bright"
          >
            <p className="text-sm font-semibold text-ink">AI assistant</p>
            <p className="mt-1 text-xs text-muted">Ask about symptoms</p>
          </Link>
          <Link
            href="/upload"
            className="rounded-2xl bg-surface px-3 py-4 ring-1 ring-line transition hover:ring-leaf-bright"
          >
            <p className="text-sm font-semibold text-ink">Upload photos</p>
            <p className="mt-1 text-xs text-muted">Add field images</p>
          </Link>
        </section>

        <div className="-mx-4 mt-auto">
          <BottomNav active="/dashboard" />
        </div>
      </div>
    </AppShell>
  );
}
