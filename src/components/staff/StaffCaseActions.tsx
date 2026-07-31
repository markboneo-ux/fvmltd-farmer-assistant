"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import type { UrgencyLevel } from "@/lib/assessment/types";
import type { StaffAssessmentView } from "@/lib/staff/types";

type Props = {
  caseId: string;
  assessment: StaffAssessmentView | null;
  isUrgent: boolean;
  closed: boolean;
};

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StaffCaseActions({
  caseId,
  assessment,
  isUrgent,
  closed,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [question, setQuestion] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [notes, setNotes] = useState("");

  const [summary, setSummary] = useState(
    assessment?.effectiveSummary ?? "",
  );
  const [causes, setCauses] = useState(
    listToText(assessment?.effectiveLikelyCauses ?? []),
  );
  const [actions, setActions] = useState(
    listToText(assessment?.effectiveImmediateActions ?? []),
  );
  const [missing, setMissing] = useState(
    listToText(assessment?.effectiveMissingInformation ?? []),
  );
  const [urgency, setUrgency] = useState(
    assessment?.effectiveUrgencyLevel ?? "moderate",
  );

  async function runAction(
    key: string,
    path: string,
    init?: RequestInit,
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/staff/cases/${caseId}/${path}`, {
        method: init?.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Action failed.");
        return;
      }
      setNotice(payload?.message ?? "Saved.");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    await runAction("approve", "approve", {
      body: JSON.stringify({ notes: notes || undefined }),
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    await runAction("edit", "assessment", {
      method: "PATCH",
      body: JSON.stringify({
        caseSummary: summary,
        likelyCauses: textToList(causes),
        immediateSafeActions: textToList(actions),
        missingInformation: textToList(missing),
        urgencyLevel: urgency,
        editNotes: notes,
      }),
    });
    setShowEdit(false);
  }

  async function askFarmer(event: FormEvent) {
    event.preventDefault();
    await runAction("ask", "ask", {
      body: JSON.stringify({ question }),
    });
    setQuestion("");
  }

  async function requestTest(type: "soil" | "laboratory") {
    await runAction(`test-${type}`, "request-test", {
      body: JSON.stringify({ requestType: type, notes }),
    });
  }

  async function toggleUrgent() {
    await runAction("urgent", "urgent", {
      body: JSON.stringify({ urgent: !isUrgent }),
    });
  }

  async function closeCase(event: FormEvent) {
    event.preventDefault();
    await runAction("close", "close", {
      body: JSON.stringify({ reason: closeReason }),
    });
  }

  if (closed) {
    return (
      <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
        <h2 className="font-display text-lg font-semibold text-ink">Actions</h2>
        <p className="mt-2 text-sm text-muted">This case is closed.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-display text-lg font-semibold text-ink">
        Staff actions
      </h2>
      <p className="text-sm text-muted">
        Approve or edit the assessment. When human review remains required, do
        not treat AI product suggestions as final.
      </p>

      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          disabled={!assessment || busy !== null}
          onClick={approve}
        >
          {busy === "approve" ? "Approving…" : "Approve assessment"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!assessment || busy !== null}
          onClick={() => setShowEdit((value) => !value)}
        >
          {showEdit ? "Hide edit form" : "Edit assessment"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={toggleUrgent}
        >
          {busy === "urgent"
            ? "Updating…"
            : isUrgent
              ? "Clear urgent"
              : "Mark urgent"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => requestTest("soil")}
        >
          {busy === "test-soil" ? "Requesting…" : "Request soil test"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => requestTest("laboratory")}
          className="sm:col-span-2"
        >
          {busy === "test-laboratory"
            ? "Requesting…"
            : "Request laboratory test"}
        </Button>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Notes for test requests / approval
        </span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="w-full rounded-xl border border-line bg-field/40 px-3 py-2 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
          placeholder="Optional staff notes"
        />
      </label>

      {showEdit && assessment ? (
        <form onSubmit={saveEdit} className="space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold text-ink">Edit assessment</h3>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Summary</span>
            <textarea
              required
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Likely causes (one per line)
            </span>
            <textarea
              required
              value={causes}
              onChange={(event) => setCauses(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Immediate safe actions (one per line)
            </span>
            <textarea
              value={actions}
              onChange={(event) => setActions(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">
              Missing information (one per line)
            </span>
            <textarea
              value={missing}
              onChange={(event) => setMissing(event.target.value)}
              rows={2}
              className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Urgency</span>
            <select
              value={urgency}
              onChange={(event) =>
                setUrgency(event.target.value as UrgencyLevel)
              }
              className="min-h-12 w-full rounded-xl border border-line px-3 text-sm outline-none ring-leaf-bright focus:ring-2"
            >
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <Button type="submit" disabled={busy !== null}>
            {busy === "edit" ? "Saving…" : "Save edited assessment"}
          </Button>
        </form>
      ) : null}

      <form onSubmit={askFarmer} className="space-y-3 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">Ask farmer another question</h3>
        <textarea
          required
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="What else do you need from the farmer?"
          className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
        />
        <Button type="submit" variant="secondary" disabled={busy !== null}>
          {busy === "ask" ? "Sending…" : "Send question"}
        </Button>
      </form>

      <form onSubmit={closeCase} className="space-y-3 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">Close case</h3>
        <textarea
          value={closeReason}
          onChange={(event) => setCloseReason(event.target.value)}
          rows={2}
          placeholder="Optional close reason"
          className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none ring-leaf-bright focus:ring-2"
        />
        <Button type="submit" variant="ghost" disabled={busy !== null}>
          {busy === "close" ? "Closing…" : "Close case"}
        </Button>
      </form>
    </section>
  );
}
