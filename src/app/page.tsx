import Link from "next/link";
import { Button } from "@/components/Button";
import { FieldIllustration } from "@/components/FieldIllustration";

export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-canopy">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden">
        <div className="absolute inset-0">
          <FieldIllustration />
        </div>

        <div className="relative z-10 flex min-h-dvh flex-col justify-end px-5 pb-8 pt-10 text-white">
          <div className="animate-rise mb-auto">
            <p className="text-sm font-semibold tracking-[0.18em] text-mint uppercase">
              FVMLTD
            </p>
            <h1 className="font-display mt-2 max-w-[14ch] text-4xl leading-[1.05] font-semibold text-balance">
              Farmer Crop Assistant
            </h1>
          </div>

          <div className="animate-rise-delay space-y-5">
            <p className="max-w-[32ch] text-base leading-relaxed text-white/90">
              Practical crop guidance for tropical smallholder farmers—starting with a clear check of plant health.
            </p>

            <div className="flex flex-col gap-3">
              <Button href="/register" className="bg-sun text-soil hover:bg-[#f0c25d]">
                Get started
              </Button>
              <Button
                href="/dashboard"
                variant="secondary"
                className="border-0 bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25"
              >
                View farmer demo
              </Button>
            </div>

            <p className="text-center text-xs text-white/70">
              Staff?{" "}
              <Link href="/staff" className="font-semibold text-mint underline-offset-2 hover:underline">
                Open review dashboard
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
