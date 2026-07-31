import Link from "next/link";

const items = [
  { href: "/dashboard", label: "Home" },
  { href: "/crop-check", label: "Check" },
  { href: "/chat", label: "Assist" },
  { href: "/results", label: "Results" },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Farmer navigation"
      className="sticky bottom-0 mt-auto border-t border-line/80 bg-surface/90 px-2 py-2 backdrop-blur"
    >
      <ul className="grid grid-cols-4 gap-1">
        {items.map((item) => {
          const isActive = active === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-11 flex-col items-center justify-center rounded-lg text-xs font-semibold transition ${
                  isActive ? "bg-canopy text-white" : "text-muted hover:bg-sky/50 hover:text-canopy"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
