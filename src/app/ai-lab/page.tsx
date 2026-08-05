"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";

export default function AiLabPage() {
  return (
    <FarmerCaseChat
      showModeToggle
      showDiagnostics
      showTestPrompts
      defaultCountry="Trinidad and Tobago"
      title="FVM AI Laboratory"
      subtitle="Region-aware Caribbean crop advisory — Quick Help by default (max three questions), working photo upload, verified Trinidad inputs, and weather-linked risk. Endpoint /api/ai/case."
    />
  );
}
