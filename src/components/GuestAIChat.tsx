"use client";

import Link from "next/link";
import { FarmerCaseChat } from "@/components/FarmerCaseChat";

type GuestAIChatProps = {
  /** When true, show a light bottom link strip instead of full app chrome. */
  showProfileLink?: boolean;
};

/**
 * Default farmer experience — Quick Help case engine (not free-text chat).
 */
export function GuestAIChat({ showProfileLink = true }: GuestAIChatProps) {
  return (
    <div className="relative">
      <FarmerCaseChat
        showModeToggle
        showDiagnostics={false}
        showTestPrompts
        defaultCountry="Trinidad and Tobago"
        title="FVMLTD Crop Quick Help"
        subtitle="Ask about tomato problems in Trinidad and Tobago. Preliminary guidance after a few questions — upload a photo when you can."
      />
      {showProfileLink ? (
        <div className="border-t border-line/70 bg-surface px-4 py-3 text-center text-xs text-muted">
          Optional:{" "}
          <Link href="/register" className="font-semibold text-canopy underline">
            save a farmer profile
          </Link>{" "}
          ·{" "}
          <Link href="/ai-lab" className="font-semibold text-canopy underline">
            AI lab diagnostics
          </Link>
        </div>
      ) : null}
    </div>
  );
}
