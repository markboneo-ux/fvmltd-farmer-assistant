import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";

function DashboardFallback() {
  return (
    <AppShell bare>
      <div className="px-4 pt-6 text-sm text-muted">Loading dashboard…</div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardView />
    </Suspense>
  );
}
