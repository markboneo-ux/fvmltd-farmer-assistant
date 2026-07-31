import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { uploadSlots } from "@/data/placeholder";

const statusStyles = {
  empty: "border-dashed border-line bg-surface/70 text-muted",
  ready: "border-solid border-leaf-bright bg-sky/50 text-canopy",
  uploaded: "border-solid border-canopy bg-canopy text-white",
} as const;

const statusLabel = {
  empty: "Tap to add",
  ready: "Ready to capture",
  uploaded: "Photo added",
} as const;

export default function UploadPage() {
  return (
    <AppShell
      title="Upload crop photographs"
      subtitle="Clear daylight photos help staff and future AI checks. This screen uses placeholder states only."
      showBack
      backHref="/crop-check"
      footer={
        <div className="space-y-3">
          <Button href="/results">Run assessment preview</Button>
          <Button href="/chat" variant="secondary">
            Ask the assistant first
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl bg-sun/20 px-3 py-3 text-sm text-soil ring-1 ring-sun/40">
        Tip: Fill the frame with the plant, avoid heavy shade, and keep fingers out of the shot.
      </div>

      <ul className="space-y-3">
        {uploadSlots.map((slot) => (
          <li key={slot.id}>
            <button
              type="button"
              className={`flex w-full flex-col items-start rounded-2xl border-2 px-4 py-4 text-left transition active:scale-[0.99] ${statusStyles[slot.status]}`}
            >
              <span className="text-sm font-semibold">{slot.label}</span>
              <span
                className={`mt-1 text-xs ${
                  slot.status === "uploaded" ? "text-white/80" : "opacity-80"
                }`}
              >
                {slot.hint}
              </span>
              <span className="mt-3 text-xs font-semibold tracking-wide uppercase">
                {statusLabel[slot.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-center text-xs text-muted">
        Prefer chatting first?{" "}
        <Link href="/chat" className="font-semibold text-leaf hover:underline">
          Open AI assistant
        </Link>
      </p>
    </AppShell>
  );
}
