"use client";

import { FarmerCaseChat } from "@/components/FarmerCaseChat";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";

/**
 * Default farmer experience on /.
 * No registration or login required.
 */
export function GuestAIChat() {
  return (
    <FarmerCaseChat
      showModeToggle={false}
      showDiagnostics={false}
      showTestPrompts={false}
      defaultCountry="Trinidad and Tobago"
      title={PRODUCT_NAME}
      subtitle={PRODUCT_SUBTITLE}
    />
  );
}
