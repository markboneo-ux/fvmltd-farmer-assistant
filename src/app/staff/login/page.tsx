import Link from "next/link";
import { StaffLoginForm } from "@/components/staff/StaffLoginForm";
import { StaffShell } from "@/components/staff/StaffShell";
import { getStaffSession } from "@/lib/staff/auth";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function StaffLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getStaffSession();
  if (session.ok) {
    redirect(
      params.next?.startsWith("/staff") ? params.next : "/staff",
    );
  }

  return (
    <StaffShell
      title="FVMLTD staff sign in"
      subtitle="Only authenticated FVMLTD staff can open the review dashboard."
      backHref="/"
    >
      <div className="mx-auto w-full max-w-md animate-rise-delay rounded-2xl bg-surface p-5 ring-1 ring-line">
        {params.error === "config" ? (
          <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            Supabase is not configured. Add environment variables before signing
            in.
          </p>
        ) : null}
        <StaffLoginForm nextPath={params.next ?? "/staff"} />
        <p className="mt-4 text-center text-xs text-muted">
          Need access? Ask an FVMLTD admin to create your staff account in
          Supabase Auth and link it in <code>staff_users</code>.
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
