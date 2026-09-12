import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminFarmersPage() {
  return (
    <AdminInsightsLayout
      title="Farmers"
      subtitle="Guest vs registered engagement. Individual farmers are not identified here."
      current="/admin/insights/farmers"
      section="farmers"
    />
  );
}
