import { AdminInsightsView } from "@/components/admin/AdminInsightsView";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffSession } from "@/lib/staff/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminInsightsPage() {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login?next=/admin/insights");
  }
  return (
    <StaffShell
      title="FVMLTD insights"
      subtitle="Internal analytics. Trend summaries stay aggregate — farmer names and emails are not shown here."
      staffName={session.staff.fullName}
      backHref="/staff"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/staff"
            className="rounded-full bg-sky px-3 py-2 text-sm font-medium text-canopy ring-1 ring-line"
          >
            Crop-check queue
          </Link>
          <StaffSignOutButton />
        </div>
      }
    >
      <AdminInsightsView />
    </StaffShell>
  );
}
