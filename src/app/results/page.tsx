import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AssessmentResultsView } from "@/components/AssessmentResultsView";

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <AppShell bare>
          <div className="px-4 pt-6 text-sm text-muted">Loading results…</div>
        </AppShell>
      }
    >
      <AssessmentResultsView />
    </Suspense>
  );
}
