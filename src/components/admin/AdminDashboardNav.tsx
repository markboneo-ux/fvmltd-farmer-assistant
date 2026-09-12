import Link from "next/link";

const LINKS = [
  { href: "/admin/insights", label: "Overview" },
  { href: "/admin/cases", label: "Cases" },
  { href: "/admin/insights/trends", label: "Trends" },
  { href: "/admin/insights/farmers", label: "Farmers" },
  { href: "/admin/insights/countries", label: "Countries" },
  { href: "/admin/insights/questions", label: "Questions" },
  { href: "/admin/insights/follow-ups", label: "Follow-ups" },
  { href: "/admin/insights/research", label: "Research Coverage" },
] as const;

export function AdminDashboardNav({ current }: { current: string }) {
  return (
    <nav
      aria-label="Insights sections"
      className="mb-4 flex gap-2 overflow-x-auto pb-1 text-sm"
    >
      {LINKS.map((item) => {
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`min-h-10 shrink-0 rounded-full px-3 py-2 font-medium ${
              active
                ? "bg-canopy text-white"
                : "bg-surface text-canopy ring-1 ring-line"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
