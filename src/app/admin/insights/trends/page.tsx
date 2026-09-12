import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminTrendsPage() {
  return (
    <AdminInsightsLayout
      title="Trends"
      subtitle="Emerging patterns across unique farmers. Never labelled as an outbreak until reviewed."
      current="/admin/insights/trends"
      section="trends"
    />
  );
}
