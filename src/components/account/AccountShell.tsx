import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PRODUCT_NAME } from "@/lib/brand";

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <BrandLogo className="h-9 w-auto" />
          <span className="truncate text-sm font-semibold text-canopy">{PRODUCT_NAME}</span>
        </Link>
        <Link href="/" className="text-sm font-medium text-canopy underline underline-offset-2">
          Back to chat
        </Link>
      </header>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-4 flex-1">{children}</div>
    </main>
  );
}
