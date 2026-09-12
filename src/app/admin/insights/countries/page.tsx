import { AdminInsightsLayout } from "@/components/admin/AdminInsightsLayout";

export default function AdminCountriesPage() {
  return (
    <AdminInsightsLayout
      title="Countries"
      subtitle="Cases by country and region. Unknown stays unknown — Trinidad is never assumed."
      current="/admin/insights/countries"
      section="countries"
    />
  );
}
