import { AppShell } from "@/components/AppShell";
import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <AppShell
      title="Farmer registration"
      subtitle="Tell us about your farm so crop checks can be tailored to your fields. You will receive a unique Farmer ID."
      showBack
      backHref="/"
    >
      <RegisterForm />
    </AppShell>
  );
}
