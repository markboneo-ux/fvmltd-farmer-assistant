import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminInsightsPage() {
  return (
    <AdminInsightsLayout
      title="Overview"
      subtitle="How many farmers are using this, what they are asking, and whether problems are increasing."
      current="/admin/insights"
      section="overview"
    />
  );
}
