import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AddCropCycleForm } from "@/components/AddCropCycleForm";

export default function NewCropCyclePage() {
  return (
    <AppShell
      title="Create crop cycle"
      subtitle="Capture what you planted, when, and where it is growing now."
      showBack
      backHref="/dashboard"
    >
      <Suspense
        fallback={
          <p className="text-sm text-muted">Loading crop cycle form…</p>
        }
      >
        <AddCropCycleForm />
      </Suspense>
    </AppShell>
  );
}
