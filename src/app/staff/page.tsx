import { redirect } from "next/navigation";
import { StaffQueue } from "@/components/staff/StaffQueue";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffSession } from "@/lib/staff/auth";
import { listStaffQueueCases } from "@/lib/staff/cases";
import type { StaffCaseFilter } from "@/lib/staff/types";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";

type PageProps = {
  searchParams: Promise<{ filter?: string }>;
};

const FILTERS: StaffCaseFilter[] = ["new", "urgent", "in_review", "all"];

function parseFilter(value: string | undefined): StaffCaseFilter {
  if (value && FILTERS.includes(value as StaffCaseFilter)) {
    return value as StaffCaseFilter;
  }
  return "in_review";
}

export default async function StaffReviewPage({ searchParams }: PageProps) {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login");
  }

  const filter = parseFilter((await searchParams).filter);
  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return (
      <StaffShell
        title="Staff review dashboard"
        subtitle="Could not connect to Supabase."
        staffName={session.staff.fullName}
        actions={<StaffSignOutButton />}
      >
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {admin.error}
        </p>
      </StaffShell>
    );
  }

  let cases;
  let stats;
  try {
    const result = await listStaffQueueCases(admin.client, filter);
    cases = result.cases;
    stats = result.stats;
  } catch {
    return (
      <StaffShell
        title="Staff review dashboard"
        subtitle="Secure queue for FVMLTD agronomists and reviewers."
        staffName={session.staff.fullName}
        actions={<StaffSignOutButton />}
      >
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load the review queue. Apply the latest migrations and try
          again.
        </p>
      </StaffShell>
    );
  }

  return (
    <StaffShell
      title="Staff review dashboard"
      subtitle="Review new, urgent, and awaiting-review crop cases from farmers."
      staffName={session.staff.fullName}
      actions={<StaffSignOutButton />}
    >
      <StaffQueue cases={cases} stats={stats} filter={filter} />
    </StaffShell>
  );
}
