import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminResearchPage() {
  return (
    <AdminInsightsLayout
      title="Research Coverage"
      subtitle="Where pesticide, weather, market and official agricultural sources are verified, partial, or missing."
      current="/admin/insights/research"
      section="research"
    />
  );
}
