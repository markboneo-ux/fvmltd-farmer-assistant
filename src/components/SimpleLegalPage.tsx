import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PRODUCT_NAME } from "@/lib/brand";

export function SimpleLegalPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-6 flex items-center gap-2 text-canopy">
        <BrandLogo className="h-9 w-auto" />
        <span className="text-sm font-semibold">{PRODUCT_NAME}</span>
      </Link>
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink">
        {body.split("\n\n").map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}
      </div>
      <p className="mt-8 text-sm">
        <Link href="/" className="text-canopy underline underline-offset-2">
          Back to FVM Crop Solution
        </Link>
      </p>
    </main>
  );
}
