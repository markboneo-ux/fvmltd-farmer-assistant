import { GuestAIChat } from "@/components/GuestAIChat";

/**
 * AI-first guest homepage — farmers can ask immediately.
 * Registration and farm setup are optional and never block chat.
 */
export default function HomePage() {
  return <GuestAIChat />;
}
