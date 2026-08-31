"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";
import { PRODUCT_NAME } from "@/lib/brand";

export default function AiLabPage() {
  return (
    <FarmerCaseChat
      showModeToggle
      showDiagnostics
      showTestPrompts
      defaultCountry="Trinidad and Tobago"
      title={PRODUCT_NAME}
      subtitle="Developer lab — diagnostics stay hidden unless opened"
    />
  );
}
