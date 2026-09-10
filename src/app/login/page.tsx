"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-8 text-sm text-muted">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
