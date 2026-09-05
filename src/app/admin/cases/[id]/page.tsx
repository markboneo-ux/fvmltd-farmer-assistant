import { AdminCaseReviewView } from "@/components/admin/AdminCaseReviewView";
import { getStaffSession } from "@/lib/staff/auth";
import { getCropCase, listCaseMessages } from "@/lib/cases/store";
import { redirect, notFound } from "next/navigation";

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
  const cropCase = await getCropCase(id);
  if (!cropCase) notFound();
  const messages = await listCaseMessages(id);
  return <AdminCaseReviewView cropCase={cropCase} messages={messages} />;
}
