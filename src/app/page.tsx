import { GuestAIChat } from "@/components/GuestAIChat";

/**
 * Production farmer route.
 * GET / must serve FVM Crop Solution — never a platform 404, login wall, or /ai-lab.
 */
export default function HomePage() {
  return <GuestAIChat />;
}
