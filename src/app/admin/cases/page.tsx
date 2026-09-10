import { AdminCaseListView } from "@/components/admin/AdminCaseListView";
import { AdminDashboardNav } from "@/components/admin/AdminDashboardNav";
import { StaffShell } from "@/components/staff/StaffShell";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

export default async function AdminCasesPage() {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/admin/login?next=/admin/cases");
  }
  return (
    <StaffShell
      title="Cases"
      subtitle="Open individual crop conversations. Unknown crop or location stays Unknown."
      staffName={session.staff.fullName}
      backHref="/admin/insights"
    >
      <AdminDashboardNav current="/admin/cases" />
      <AdminCaseListView />
    </StaffShell>
  );
}
