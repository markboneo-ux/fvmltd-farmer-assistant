import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-dvh max-w-md px-4 py-8 text-sm text-muted">Loading…</main>}>
      <SignInForm />
    </Suspense>
  );
}
