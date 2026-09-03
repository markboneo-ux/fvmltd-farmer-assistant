import { AdminInsightsView } from "@/components/admin/AdminInsightsView";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

export default async function AdminInsightsPage() {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login?next=/admin/insights");
  }
  return <AdminInsightsView />;
}
