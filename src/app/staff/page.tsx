import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { staffQueue, staffStats } from "@/data/placeholder";

const priorityTone = {
  High: "high",
  Medium: "mild",
  Low: "low",
} as const;

export default function StaffReviewPage() {
  return (
    <AppShell
      title="Staff review dashboard"
      subtitle="Agronomist queue for farmer assessments. All rows are placeholder demo data."
      showBack
      backHref="/"
      footer={
        <Button href="/results" variant="secondary">
          Open sample assessment
        </Button>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-2 border-y border-line py-3">
        {staffStats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="font-display text-xl font-semibold text-canopy">{stat.value}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Review queue</h2>
        <span className="text-xs font-medium text-muted">{staffQueue.length} open</span>
      </div>

      <ul className="space-y-3">
        {staffQueue.map((item) => (
          <li key={item.id}>
            <Link
              href="/results"
              className="block rounded-2xl bg-surface px-4 py-3 ring-1 ring-line transition hover:ring-leaf-bright"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{item.farmer}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {item.village} · {item.submitted}
                  </p>
                </div>
                <StatusPill
                  label={item.priority}
                  tone={priorityTone[item.priority as keyof typeof priorityTone]}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-leaf">{item.crop}</span>
                <span className="text-muted">{item.aiFlag}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
