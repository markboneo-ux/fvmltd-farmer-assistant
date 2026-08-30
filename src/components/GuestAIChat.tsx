"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";

/**
 * Default farmer experience — conversational Farmersvaluemart AI.
 * No registration required to start chatting.
 */
export function GuestAIChat() {
  return (
    <FarmerCaseChat
      showModeToggle={false}
      showDiagnostics={false}
      showTestPrompts={false}
      defaultCountry="Trinidad and Tobago"
      title="Farmersvaluemart AI"
      subtitle="Your Caribbean farming assistant"
    />
  );
}
