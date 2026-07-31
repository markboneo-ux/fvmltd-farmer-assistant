import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { cropOptions } from "@/data/placeholder";

export default function CropCheckPage() {
  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-leaf"
          >
            <span aria-hidden>←</span>
            Back
          </Link>
          <h1 className="font-display text-2xl font-semibold text-ink">Start crop check</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Choose the crop you want to inspect. You can add photos and notes next.
          </p>
        </header>

        <ul className="animate-rise-delay grid grid-cols-2 gap-3">
          {cropOptions.map((crop, index) => (
            <li key={crop.id}>
              <Link
                href="/upload"
                className={`flex min-h-[7.5rem] flex-col justify-between rounded-2xl px-3 py-3 ring-1 transition ${
                  index === 0
                    ? "bg-canopy text-white ring-canopy"
                    : "bg-surface text-ink ring-line hover:ring-leaf-bright"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    index === 0 ? "bg-white/15 text-mint" : "bg-sky text-canopy"
                  }`}
                >
                  {crop.name.slice(0, 1)}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{crop.name}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      index === 0 ? "text-white/75" : "text-muted"
                    }`}
                  >
                    {crop.stage}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="animate-rise-late mt-6 space-y-3">
          <label className="block space-y-1.5" htmlFor="notes">
            <span className="text-sm font-medium text-ink">What are you noticing?</span>
            <textarea
              id="notes"
              rows={3}
              defaultValue="Yellow patches and curling on young cassava leaves after heavy rain."
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-ink outline-none ring-canopy/30 focus:ring-2"
            />
          </label>
          <Button href="/upload">Continue to photos</Button>
        </div>

        <div className="-mx-4 mt-auto">
          <BottomNav active="/crop-check" />
        </div>
      </div>
    </AppShell>
  );
}
