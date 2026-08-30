"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";

export default function AiLabPage() {
  return (
    <FarmerCaseChat
      showModeToggle
      showDiagnostics
      showTestPrompts
      defaultCountry="Trinidad and Tobago"
      title="Farmersvaluemart AI"
      subtitle="Developer lab — diagnostics stay hidden unless opened"
    />
  );
}
