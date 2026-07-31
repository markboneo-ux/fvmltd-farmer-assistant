import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { chatMessages } from "@/data/placeholder";

export default function ChatPage() {
  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-4">
          <div className="mb-3 flex items-center justify-between">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-sm font-medium text-leaf"
            >
              <span aria-hidden>←</span>
              Back
            </Link>
            <span className="rounded-md bg-canopy/10 px-2 py-1 text-[11px] font-medium text-canopy">
              Demo chat
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">AI crop assistant</h1>
          <p className="mt-1.5 text-sm text-muted">
            Placeholder conversation. No AI service is connected yet.
          </p>
        </header>

        <div className="animate-rise-delay flex flex-1 flex-col gap-3 pb-4">
          {chatMessages.map((message) => {
            const isFarmer = message.role === "farmer";
            return (
              <div
                key={message.id}
                className={`flex ${isFarmer ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isFarmer
                      ? "rounded-br-md bg-canopy text-white"
                      : "rounded-bl-md bg-surface text-ink ring-1 ring-line"
                  }`}
                >
                  <p>{message.text}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      isFarmer ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {message.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="animate-rise-late space-y-3 pb-2">
          <div className="flex gap-2">
            <input
              type="text"
              defaultValue="Should I remove the yellow leaves now?"
              aria-label="Message the assistant"
              className="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-sm outline-none ring-canopy/30 focus:ring-2"
              readOnly
            />
            <button
              type="button"
              className="min-h-12 rounded-xl bg-leaf px-4 text-sm font-semibold text-white"
            >
              Send
            </button>
          </div>
          <Button href="/upload" variant="secondary">
            Attach crop photographs
          </Button>
        </div>

        <div className="-mx-4 mt-2">
          <BottomNav active="/chat" />
        </div>
      </div>
    </AppShell>
  );
}
