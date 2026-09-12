import Link from "next/link";
import { StaffLoginForm } from "@/components/staff/StaffLoginForm";
import { StaffShell } from "@/components/staff/StaffShell";
import { getStaffSession } from "@/lib/staff/auth";
import { STAFF_DASHBOARD_HOME_PATH } from "@/lib/staff/login-path";
import { safeStaffNextPath } from "@/lib/staff/next-path";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
};

export default async function AdminStaffLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getStaffSession();
  const nextPath = safeStaffNextPath(params.next || STAFF_DASHBOARD_HOME_PATH);
  if (session.ok) {
    redirect(nextPath);
  }

  return (
    <StaffShell
      title="Staff dashboard sign-in"
      subtitle="FVMLTD staff only. Farmers cannot open this dashboard with a farmer account."
      backHref="/"
    >
      <div className="mx-auto w-full max-w-md animate-rise-delay rounded-2xl bg-surface p-5 ring-1 ring-line">
        {params.error === "config" ? (
          <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            Supabase is not configured. Add environment variables before signing
            in.
          </p>
        ) : null}
        {params.reset === "success" ? (
          <p className="mb-4 rounded-xl bg-leaf/10 px-3 py-2 text-sm text-canopy">
            Your password was updated. Sign in with your new password.
          </p>
        ) : null}
        <StaffLoginForm nextPath={nextPath} />
        <p className="mt-4 text-center text-xs text-muted">
          Need access? Ask an FVMLTD admin to create your staff Auth user and set{" "}
          <code>staff_profiles.auth_user_id</code> to that user id.
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/" className="font-medium text-leaf hover:text-canopy">
            Return to farmer app
          </Link>
        </p>
      </div>
    </StaffShell>
  );
}
