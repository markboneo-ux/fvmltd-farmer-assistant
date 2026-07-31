import Link from "next/link";

type StaffShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  staffName?: string;
  backHref?: string;
  actions?: React.ReactNode;
};

export function StaffShell({
  children,
  title,
  subtitle,
  staffName,
  backHref,
  actions,
}: StaffShellProps) {
  return (
    <div className="field-pattern min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-10 pt-5 sm:px-6">
        <header className="animate-rise mb-6 border-b border-line pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex items-center gap-1 text-sm font-medium text-leaf transition hover:text-canopy"
                >
                  <span aria-hidden>←</span>
                  Back
                </Link>
              ) : (
                <span className="text-xs font-semibold tracking-[0.14em] text-leaf uppercase">
                  FVMLTD Staff
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {staffName ? (
                <span className="text-xs font-medium text-muted">{staffName}</span>
              ) : null}
              <span className="rounded-md bg-canopy/10 px-2 py-1 text-[11px] font-medium text-canopy">
                Secure
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl leading-tight font-semibold text-ink text-balance sm:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </header>
        <main className="animate-rise-delay flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
