import { AdminCaseReviewView } from "@/components/admin/AdminCaseReviewView";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminCaseReviewPage({ params }: PageProps) {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login?next=/admin/insights");
  }
  const { id } = await params;
  return (
    <StaffShell
      title="Case review"
      subtitle="Staff-only detail. Use this to confirm, reject, or exclude a case from trend learning."
      staffName={session.staff.fullName}
      backHref="/admin/insights"
      actions={<StaffSignOutButton />}
    >
      <AdminCaseReviewView caseId={id} />
    </StaffShell>
  );
}
