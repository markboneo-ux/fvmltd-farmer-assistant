import { StaffResetPasswordForm } from "@/components/staff/StaffResetPasswordForm";
import { StaffShell } from "@/components/staff/StaffShell";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function StaffResetPasswordPage() {
  return (
    <StaffShell
      title="Set a new staff password"
      subtitle="This page is for FVMLTD staff only. After you save a new password, sign in on the staff dashboard."
      backHref="/admin/login"
    >
      <div className="mx-auto w-full max-w-md animate-rise-delay rounded-2xl bg-surface p-5 ring-1 ring-line">
        <StaffResetPasswordForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/admin/login" className="font-medium text-leaf hover:text-canopy">
            Return to staff sign-in
          </Link>
        </p>
      </div>
    </StaffShell>
  );
}
