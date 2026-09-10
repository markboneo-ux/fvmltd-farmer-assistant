import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";

export function FarmerSubpage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <BrandLogo className="h-10 w-auto" />
        <span>
          <span className="block text-sm font-semibold text-canopy">{PRODUCT_NAME}</span>
          <span className="block text-xs text-muted">{PRODUCT_SUBTITLE}</span>
        </span>
      </Link>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </main>
  );
}
