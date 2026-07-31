"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { CasePhotoUploader } from "@/components/CasePhotoUploader";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";

function UploadPageContent() {
  const farmer = useRegisteredFarmer();
  const searchParams = useSearchParams();
  const router = useRouter();
  const caseId = searchParams.get("caseId")?.trim() ?? "";

  if (!farmer) {
    return (
      <AppShell
        title="Upload crop photographs"
        subtitle="Register first, then complete a crop check to attach photographs."
        showBack
        backHref="/crop-check"
      >
        <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
          <p className="text-sm text-ink">
            A registered farmer profile is required before uploading crop
            photographs.
          </p>
          <Button href="/register">Register as a farmer</Button>
        </div>
      </AppShell>
    );
  }

  if (!caseId) {
    return (
      <AppShell
        title="Upload crop photographs"
        subtitle="Photographs are attached to a crop check case."
        showBack
        backHref="/crop-check"
      >
        <div className="space-y-4 rounded-2xl bg-surface px-4 py-5 ring-1 ring-line">
          <p className="text-sm text-ink">
            Start a guided crop check first. Photograph uploads are part of that
            workflow for Tomato, Pepper, and Cucumber.
          </p>
          <Button href="/crop-check">Start crop check</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Upload crop photographs"
      subtitle="Add each required photo. You may skip one, but missing required photographs stay clearly marked."
      showBack
      backHref="/crop-check"
    >
      <CasePhotoUploader
        caseId={caseId}
        farmerId={farmer.id}
        completeLabel="Save and assess"
        onCompleted={() => {
          router.push(`/results?caseId=${caseId}`);
        }}
      />
      <p className="mt-4 text-center text-xs text-muted">
        Prefer chatting first?{" "}
        <Link href="/chat" className="font-semibold text-leaf hover:underline">
          Open AI assistant
        </Link>
      </p>
    </AppShell>
  );
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Upload crop photographs" showBack backHref="/crop-check">
          <p className="text-sm text-muted">Loading upload screen…</p>
        </AppShell>
      }
    >
      <UploadPageContent />
    </Suspense>
  );
}
