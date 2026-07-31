import Link from "next/link";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  backHref?: string;
  footer?: React.ReactNode;
  bare?: boolean;
};

export function AppShell({
  children,
  title,
  subtitle,
  showBack = false,
  backHref = "/dashboard",
  footer,
  bare = false,
}: AppShellProps) {
  if (bare) {
    return (
      <div className="field-pattern min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
      </div>
    );
  }

  return (
    <div className="field-pattern min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-4">
        <header className="animate-rise mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            {showBack ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-leaf transition hover:text-canopy"
              >
                <span aria-hidden>←</span>
                Back
              </Link>
            ) : (
              <span className="text-xs font-semibold tracking-[0.14em] text-leaf uppercase">
                FVMLTD
              </span>
            )}
            <span className="rounded-md bg-canopy/10 px-2 py-1 text-[11px] font-medium text-canopy">
              Preview
            </span>
          </div>
          {title ? (
            <div>
              <h1 className="font-display text-2xl leading-tight font-semibold text-ink text-balance">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>
              ) : null}
            </div>
          ) : null}
        </header>

        <main className="animate-rise-delay flex flex-1 flex-col">{children}</main>

        {footer ? <div className="animate-rise-late mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
