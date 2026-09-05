"use client";

import { useEffect, useMemo, useState } from "react";

type CountRow = { label: string; count: number; status?: string };

type InsightsPayload = {
  insights?: {
    users: {
      total: number;
      guests: number;
      registered: number;
      active: number;
      returningUsers?: number;
      uniqueGuestSessions?: number;
    };
    overview?: {
      messagesToday: number;
      messagesThisWeek: number;
      totalMessages: number;
      totalCropCases: number;
      uniqueGuestSessions: number;
      registeredUsers: number;
      returningUsers: number;
      photosUploaded: number;
    };
    web?: {
      answersThatUsedWebResearch: number;
      sourceFailures: number;
      staleSourceWarnings: number;
      topSources: CountRow[];
    };
    activity: {
      messages: number;
      messagesToday?: number;
      messagesThisWeek?: number;
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
      questionTypes?: CountRow[];
      resolvedCount?: number;
      trendRows?: Array<{
        emergingIssue: string | null;
        crop: string | null;
        country: string | null;
        region: string | null;
        uniqueUsers: number;
        caseCount: number;
        firstSeen: string;
        lastSeen: string;
        confidence: number;
        reviewStatus: string;
      }>;
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
            <h2 className="font-semibold">Overview</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Messages today: {insights.overview?.messagesToday ?? 0}</li>
              <li>Messages this week: {insights.overview?.messagesThisWeek ?? 0}</li>
              <li>Total messages: {insights.overview?.totalMessages ?? insights.activity.messages}</li>
              <li>Total crop cases: {insights.overview?.totalCropCases ?? insights.activity.cases}</li>
              <li>Unique guest sessions: {insights.overview?.uniqueGuestSessions ?? insights.users.guests}</li>
              <li>Registered users: {insights.overview?.registeredUsers ?? insights.users.registered}</li>
              <li>Returning users: {insights.overview?.returningUsers ?? 0}</li>
              <li>Photos uploaded: {insights.overview?.photosUploaded ?? insights.activity.imageAnalyses}</li>
              <li>Usage-limit events: {insights.activity.usageLimitEvents}</li>
            </ul>
            <p className="mt-3 text-sm">
              <a className="text-canopy underline" href="/admin/cases">
                Open case review
              </a>
            </p>
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
            {(agronomy.trendRows ?? []).length > 0 ? (
              <div className="mt-4 overflow-x-auto text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th>Issue</th>
                      <th>Crop</th>
                      <th>Country</th>
                      <th>Users</th>
                      <th>Cases</th>
                      <th>Confidence</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agronomy.trendRows?.map((row) => (
                      <tr key={`${row.crop}-${row.emergingIssue}-${row.firstSeen}`}>
                        <td>{row.emergingIssue}</td>
                        <td>{row.crop}</td>
                        <td>{row.country}</td>
                        <td>{row.uniqueUsers}</td>
                        <td>{row.caseCount}</td>
                        <td>{row.confidence}</td>
                        <td>{row.reviewStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Question types</h2>
            <Bars rows={agronomy.questionTypes ?? agronomy.casesByType ?? []} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Web research</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Answers that used web research: {insights.web?.answersThatUsedWebResearch ?? 0}</li>
              <li>Source failures: {insights.web?.sourceFailures ?? 0}</li>
              <li>Stale-source warnings: {insights.web?.staleSourceWarnings ?? 0}</li>
            </ul>
            <Bars rows={insights.web?.topSources ?? []} />
          </section>
        </div>
      ) : null}
    </main>
  );
}
