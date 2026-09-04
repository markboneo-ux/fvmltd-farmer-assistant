"use client";

import { useEffect, useMemo, useState } from "react";

type CountRow = { label: string; count: number; status?: string };

type InsightsPayload = {
  insights?: {
    users: { total: number; guests: number; registered: number; active: number };
    activity: {
      messages: number;
      imageAnalyses: number;
      cases: number;
      usageLimitEvents: number;
      upgradeViews: number;
      upgradeClicks: number;
      promoAttempts: number;
      promoSuccesses: number;
    };
    agronomy: {
      problemsByCrop: CountRow[];
      problemsByCountry: CountRow[];
      problemsByDistrict: CountRow[];
      problemsByVariety: CountRow[];
      problemsByWeek: CountRow[];
      mostReportedPest: CountRow | null;
      mostReportedDisease: CountRow | null;
      nutrientRelated: number;
      stunting: number;
      wilting: number;
      photoAssisted: number;
      unresolved: number;
      humanEscalations: number;
      casesImproved: number;
      casesUnchanged: number;
      casesWorsened: number;
      problemSolved: number;
      topSymptoms?: CountRow[];
      topSuspectedIssues?: CountRow[];
      casesByCountry?: CountRow[];
      casesByRegion?: CountRow[];
      casesOverTime?: CountRow[];
      confirmedDiagnoses?: number;
      agronomistReviewed?: number;
      solvedCount?: number;
      unresolvedCount?: number;
      photoUsage?: number;
      averageFollowupCompletionPercent?: number;
      followupAsked?: number;
      followupPending?: number;
      followupWithOutcome?: number;
      mostCommonBusinessQuestions?: CountRow[];
      mostCommonCalculations?: CountRow[];
      mostCommonNonDiagnosticNeeds?: CountRow[];
      casesByType?: CountRow[];
      emergingTrends?: CountRow[];
      nonDiagnosticCaseCount?: number;
    };
  };
  trends?: Array<{ label: string; count: number; classification: string }>;
  error?: string;
};

function Bars({ rows }: { rows: CountRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">No data yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex justify-between text-sm">
            <span>{row.label}{row.status ? ` (${row.status})` : ""}</span>
            <span className="font-medium">{row.count}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-sky">
            <div
              className="h-2 rounded-full bg-canopy"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminInsightsView() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [crop, setCrop] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [caseType, setCaseType] = useState("");
  const [status, setStatus] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (country.trim()) params.set("country", country.trim());
    if (crop.trim()) params.set("crop", crop.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (caseType) params.set("caseType", caseType);
    if (status) params.set("status", status);
    const text = params.toString();
    return text ? `/api/admin/insights?${text}` : "/api/admin/insights";
  }, [country, crop, from, to, caseType, status]);

  useEffect(() => {
    void (async () => {
      const response = await fetch(query);
      const payload = (await response.json()) as InsightsPayload;
      if (!response.ok) {
        setError(payload.error || "Could not load insights.");
        return;
      }
      setError(null);
      setData(payload);
    })();
  }, [query]);

  const insights = data?.insights;
  const agronomy = insights?.agronomy;
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">FVMLTD insights</h1>
      <p className="mt-1 text-sm text-muted">Internal only. Farmer identities are not shown.</p>
      <form
        className="mt-4 grid gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line md:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="text-sm">
          Country
          <input
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Crop
          <input
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={crop}
            onChange={(event) => setCrop(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Case type
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={caseType}
            onChange={(event) => setCaseType(event.target.value)}
          >
            <option value="">All</option>
            <option value="crop_problem">Crop problem</option>
            <option value="farm_business">Farm business</option>
            <option value="calculation">Calculation</option>
            <option value="general">General</option>
          </select>
        </label>
        <label className="text-sm">
          Status
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
            <option value="human_review">Human review</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="text-sm">
          From
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
      </form>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      {insights && agronomy ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">User metrics</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Total unique farmers/sessions: {insights.users.total}</li>
              <li>Guest sessions: {insights.users.guests}</li>
              <li>Registered farmers: {insights.users.registered}</li>
              <li>Active users: {insights.users.active}</li>
              <li>Messages: {insights.activity.messages}</li>
              <li>Photo analyses: {insights.activity.imageAnalyses}</li>
              <li>Total crop cases: {insights.activity.cases}</li>
              <li>Usage-limit events: {insights.activity.usageLimitEvents}</li>
              <li>Upgrade clicks: {insights.activity.upgradeClicks}</li>
              <li>Promo redemptions: {insights.activity.promoSuccesses}</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Outcomes and follow-up</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Confirmed diagnoses: {agronomy.confirmedDiagnoses ?? 0}</li>
              <li>Agronomist reviewed: {agronomy.agronomistReviewed ?? 0}</li>
              <li>Solved: {agronomy.problemSolved}</li>
              <li>Unresolved: {agronomy.unresolved}</li>
              <li>Improved: {agronomy.casesImproved}</li>
              <li>Unchanged: {agronomy.casesUnchanged}</li>
              <li>Worsened: {agronomy.casesWorsened}</li>
              <li>Photo usage: {agronomy.photoUsage ?? agronomy.photoAssisted}</li>
              <li>Follow-ups asked: {agronomy.followupAsked ?? 0}</li>
              <li>Follow-ups pending: {agronomy.followupPending ?? 0}</li>
              <li>Follow-up completion: {agronomy.averageFollowupCompletionPercent ?? 0}%</li>
              <li>Human escalations: {agronomy.humanEscalations}</li>
              <li>Non-diagnostic needs: {agronomy.nonDiagnosticCaseCount ?? 0}</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Top crops</h2>
            <Bars rows={agronomy.problemsByCrop} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Top symptoms</h2>
            <Bars rows={agronomy.topSymptoms ?? []} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Top suspected issues</h2>
            <Bars rows={agronomy.topSuspectedIssues ?? agronomy.problemsByCrop} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Cases by country</h2>
            <Bars rows={agronomy.casesByCountry ?? agronomy.problemsByCountry} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Cases by region</h2>
            <Bars rows={agronomy.casesByRegion ?? agronomy.problemsByDistrict} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Cases over time</h2>
            <Bars rows={agronomy.casesOverTime ?? agronomy.problemsByWeek} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Business questions</h2>
            <Bars rows={agronomy.mostCommonBusinessQuestions ?? []} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Calculations</h2>
            <Bars rows={agronomy.mostCommonCalculations ?? []} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
            <h2 className="font-semibold">Most common non-diagnostic farmer needs</h2>
            <Bars rows={agronomy.mostCommonNonDiagnosticNeeds ?? []} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
            <h2 className="font-semibold">Emerging trends</h2>
            <Bars rows={agronomy.emergingTrends ?? []} />
            <ul className="mt-2 space-y-1 text-sm">
              {(data?.trends ?? []).map((trend) => (
                <li key={trend.label}>
                  {trend.label}: {trend.count} reports ({trend.classification.replaceAll("_", " ")})
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              A verified outbreak is never declared from AI reports alone. One case is not a trend.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
