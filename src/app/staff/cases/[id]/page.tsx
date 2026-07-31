import { notFound, redirect } from "next/navigation";
import { StaffCaseDetailView } from "@/components/staff/StaffCaseDetailView";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffSession } from "@/lib/staff/auth";
import { getStaffCaseDetail } from "@/lib/staff/cases";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StaffCasePage({ params }: PageProps) {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login");
  }

  const { id } = await params;
  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return (
      <StaffShell
        title="Case review"
        subtitle={admin.error}
        staffName={session.staff.fullName}
        backHref="/staff"
        actions={<StaffSignOutButton />}
      >
        <p className="text-sm text-danger">Supabase is not configured.</p>
      </StaffShell>
    );
  }

  let detail;
  try {
    detail = await getStaffCaseDetail(admin.client, id);
  } catch {
    return (
      <StaffShell
        title="Case review"
        staffName={session.staff.fullName}
        backHref="/staff"
        actions={<StaffSignOutButton />}
      >
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Could not load this case. Confirm migrations are applied.
        </p>
      </StaffShell>
    );
  }

  if (!detail) notFound();

  return (
    <StaffShell
      title={`${detail.farmer.fullName} · ${detail.case.cropName}`}
      subtitle={`${detail.farmer.farmerCode}${
        detail.cropCycle?.variety ? ` · ${detail.cropCycle.variety}` : ""
      }`}
      staffName={session.staff.fullName}
      backHref="/staff"
      actions={<StaffSignOutButton />}
    >
      <StaffCaseDetailView detail={detail} />
    </StaffShell>
  );
}
