import { AdminCaseReviewView } from "@/components/admin/AdminCaseReviewView";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

export default async function AdminCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getStaffSession();
  if (!session.ok) {
    redirect("/staff/login?next=/admin/cases");
  }
  const { id } = await params;
  return <AdminCaseReviewView caseId={id} />;
}
