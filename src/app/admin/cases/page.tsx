import { AdminCaseListView } from "@/components/admin/AdminCaseListView";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

export default async function AdminCasesPage() {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login?next=/admin/cases");
  }
  return <AdminCaseListView />;
}
