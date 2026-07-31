const tones = {
  low: "bg-mint/40 text-canopy",
  mild: "bg-sun/25 text-soil",
  moderate: "bg-danger/15 text-danger",
  high: "bg-danger/20 text-danger",
} as const;

export function StatusPill({
  label,
  tone = "low",
}: {
  label: string;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
