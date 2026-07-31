import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import type { StaffCaseFilter, StaffQueueCase, StaffQueueStats } from "@/lib/staff/types";

const FILTERS: { key: StaffCaseFilter; label: string }[] = [
  { key: "new", label: "New cases" },
  { key: "urgent", label: "Urgent cases" },
  { key: "in_review", label: "Awaiting review" },
  { key: "all", label: "All open" },
];

function urgencyTone(item: StaffQueueCase): "low" | "mild" | "moderate" | "high" {
  if (item.isUrgent || item.urgencyLevel === "critical") return "high";
  if (item.urgencyLevel === "high") return "moderate";
  if (item.urgencyLevel === "moderate") return "mild";
  return "low";
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function StaffQueue({
  cases,
  stats,
  filter,
}: {
  cases: StaffQueueCase[];
  stats: StaffQueueStats;
  filter: StaffCaseFilter;
}) {
  const statCards = [
    { label: "New cases", value: stats.newCount },
    { label: "Urgent cases", value: stats.urgentCount },
    { label: "Awaiting review", value: stats.inReviewCount },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 border-y border-line py-3 sm:gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="font-display text-xl font-semibold text-canopy sm:text-2xl">
              {stat.value}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted sm:text-xs">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <Link
              key={item.key}
              href={`/staff?filter=${item.key}`}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
                active
                  ? "bg-canopy text-white"
                  : "bg-surface text-canopy ring-1 ring-line hover:bg-sky/50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">
          Review queue
        </h2>
        <span className="text-xs font-medium text-muted">{cases.length} shown</span>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-2xl bg-surface px-4 py-8 text-center ring-1 ring-line">
          <p className="font-medium text-ink">No cases in this queue</p>
          <p className="mt-1 text-sm text-muted">
            New farmer crop checks will appear here after submission.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cases.map((item) => (
            <li key={item.id}>
              <Link
                href={`/staff/cases/${item.id}`}
                className="block rounded-2xl bg-surface px-4 py-3 ring-1 ring-line transition hover:ring-leaf-bright"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{item.farmerName}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {item.farmerCode}
                      {item.village ? ` · ${item.village}` : ""}
                      {item.district ? ` · ${item.district}` : ""}
                      {" · "}
                      {formatWhen(item.completedAt ?? item.submittedAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {item.isUrgent ? (
                      <StatusPill label="Urgent" tone="high" />
                    ) : (
                      <StatusPill
                        label={item.urgencyLevel ?? item.status}
                        tone={urgencyTone(item)}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-leaf">
                    {item.cropName}
                    {item.variety ? ` · ${item.variety}` : ""}
                  </span>
                  <span className="text-muted">
                    {item.confidenceScore != null
                      ? `${Math.round(item.confidenceScore)}% · `
                      : ""}
                    {item.aiFlag}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
