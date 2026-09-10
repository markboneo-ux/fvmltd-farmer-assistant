import { AdminDashboardNav } from "@/components/admin/AdminDashboardNav";
import { AdminInsightsView } from "@/components/admin/AdminInsightsView";
import { StaffShell } from "@/components/staff/StaffShell";
import { StaffSignOutButton } from "@/components/staff/StaffSignOutButton";
import { getStaffSession } from "@/lib/staff/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export async function AdminInsightsLayout(options: {
  title: string;
  subtitle: string;
  current: string;
  section: string;
}) {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect(`/admin/login?next=${encodeURIComponent(options.current)}`);
  }
  return (
    <StaffShell
      title={options.title}
      subtitle={options.subtitle}
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
      <AdminDashboardNav current={options.current} />
      <AdminInsightsView section={options.section} />
    </StaffShell>
  );
}
