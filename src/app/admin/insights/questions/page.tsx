import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminQuestionsPage() {
  return (
    <AdminInsightsLayout
      title="Questions"
      subtitle="What farmers are asking for: diagnosis, pests, nutrition, weather, pesticides, market, and business."
      current="/admin/insights/questions"
      section="questions"
    />
  );
}
