import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { assessment } from "@/data/placeholder";

export default function ResultsPage() {
  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-leaf"
          >
            <span aria-hidden>←</span>
            Back
          </Link>
          <p className="text-xs font-semibold tracking-[0.12em] text-leaf uppercase">
            Assessment {assessment.id}
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-ink">
            Assessment results
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Placeholder findings for {assessment.crop}. No live model is running.
          </p>
        </header>

        <section className="animate-rise-delay mb-4 rounded-2xl bg-surface px-4 py-4 ring-1 ring-line">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted">Likely issue</p>
              <h2 className="font-display mt-1 text-xl font-semibold text-ink">
                {assessment.likelyIssue}
              </h2>
            </div>
            <StatusPill label={assessment.severity} tone="moderate" />
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-muted">Confidence</span>
              <span className="font-semibold text-canopy">{assessment.confidence}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sky">
              <div
                className="h-full rounded-full bg-leaf-bright"
                style={{ width: `${assessment.confidence}%` }}
              />
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">{assessment.summary}</p>
        </section>

        <section className="animate-rise-late mb-4">
          <h2 className="font-display mb-2 text-lg font-semibold text-ink">
            Suggested next steps
          </h2>
          <ol className="space-y-2">
            {assessment.recommendations.map((item, index) => (
              <li
                key={item}
                className="flex gap-3 rounded-xl bg-surface/80 px-3 py-3 text-sm leading-relaxed text-ink ring-1 ring-line"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canopy text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-4 rounded-2xl bg-canopy px-4 py-4 text-white">
          <p className="text-xs font-semibold tracking-[0.12em] text-mint uppercase">
            Staff follow-up
          </p>
          <p className="mt-1 text-sm leading-relaxed text-white/90">{assessment.nextStep}</p>
          <div className="mt-4 grid gap-2">
            <Button href="/staff" className="bg-sun text-soil hover:bg-[#f0c25d]">
              View staff review queue
            </Button>
            <Button
              href="/chat"
              variant="secondary"
              className="border-0 bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
            >
              Discuss with assistant
            </Button>
          </div>
        </section>

        <div className="-mx-4 mt-auto">
          <BottomNav active="/results" />
        </div>
      </div>
    </AppShell>
  );
}
