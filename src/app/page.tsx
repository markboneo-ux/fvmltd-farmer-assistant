import Link from "next/link";
import { Button } from "@/components/Button";
import { FieldIllustration } from "@/components/FieldIllustration";

export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden">
        <section className="relative flex min-h-dvh flex-col">
          <div className="absolute inset-0">
            <FieldIllustration />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-white/92 via-white/88 to-white/96" />

          <div className="relative z-10 flex min-h-dvh flex-col px-5 pb-8 pt-10 text-ink">
            <div className="animate-rise mb-auto">
              <p className="font-display text-[0.7rem] font-semibold tracking-[0.22em] text-canopy uppercase">
                Farming Forward
              </p>
              <h1 className="font-display mt-3 max-w-[16ch] text-[2.15rem] leading-[1.05] font-semibold text-balance text-canopy sm:text-4xl">
                Farmers Value Mart Ltd
              </h1>
              <p className="mt-3 text-xl font-semibold tracking-tight text-ink">
                Farmer Crop Assistant
              </p>
            </div>

            <div className="animate-rise-delay space-y-5">
              <p className="max-w-[34ch] text-base leading-relaxed text-charcoal">
                Practical crop guidance built for Caribbean and tropical farmers.
              </p>

              <div className="flex flex-col gap-3">
                <Button href="/crop-check">Start Crop Check</Button>
                <Button href="/register" variant="secondary">
                  Register My Farm
                </Button>
                <Button href="/dashboard" variant="secondary">
                  Sign In
                </Button>
                <Link
                  href="#about"
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-canopy underline-offset-4 transition hover:bg-canopy/5 hover:underline"
                >
                  Learn About the Assistant
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          id="about"
          className="animate-rise-late relative z-10 border-t border-line bg-surface px-5 py-10"
        >
          <p className="text-xs font-semibold tracking-[0.16em] text-canopy uppercase">
            About the assistant
          </p>
          <h2 className="font-display mt-2 text-2xl font-semibold text-ink">
            Clear crop checks for working farms
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Register your farm, run a guided Crop Check, upload photographs, and
            receive practical next steps. FVMLTD staff can review cases when a
            closer look is needed.
          </p>
        </section>
      </div>
    </div>
  );
}
