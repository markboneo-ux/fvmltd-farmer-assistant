"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";
import { PRODUCT_NAME } from "@/lib/brand";

export default function AiLabPage() {
  return (
    <FarmerCaseChat
      showModeToggle
      showDiagnostics
      showTestPrompts
      defaultCountry={null}
      title={PRODUCT_NAME}
      subtitle="Developer lab — diagnostics stay hidden unless opened"
    />
  );
}
