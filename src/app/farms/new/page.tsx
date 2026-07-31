import { AppShell } from "@/components/AppShell";
import { AddFarmForm } from "@/components/AddFarmForm";

export default function NewFarmPage() {
  return (
    <AppShell
      title="Add a farm"
      subtitle="Record the plot details so crop cycles and checks stay tied to the right field."
      showBack
      backHref="/dashboard"
    >
      <AddFarmForm />
    </AppShell>
  );
}
