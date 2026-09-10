import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminFollowupsPage() {
  return (
    <AdminInsightsLayout
      title="Follow-ups"
      subtitle="Whether farmers report improvement, no change, worse, or solved after advice."
      current="/admin/insights/follow-ups"
      section="follow-ups"
    />
  );
}
