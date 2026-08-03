"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RegisterForm } from "@/components/RegisterForm";

export function RegisterPageClient() {
  const [showSuccess, setShowSuccess] = useState(false);

  return (
    <AppShell
      title={showSuccess ? undefined : "Farmer registration"}
      subtitle={
        showSuccess
          ? undefined
          : "Tell us about your farm so crop checks can be tailored to your fields. You will receive a unique Farmer ID."
      }
      showBack={!showSuccess}
      backHref="/"
      bare={showSuccess}
    >
      <div className={showSuccess ? "px-4 pt-6 pb-8" : undefined}>
        <RegisterForm onSuccessChange={setShowSuccess} />
      </div>
    </AppShell>
  );
}
