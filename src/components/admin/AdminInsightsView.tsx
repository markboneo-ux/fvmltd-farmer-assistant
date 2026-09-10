"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CountRow = { label: string; count: number; status?: string };

type TrendRow = CountRow & {
  firstSeen?: string;
  lastSeen?: string;
  country?: string | null;
  region?: string | null;
  confidence?: number;
  reviewed?: boolean;
  uniqueFarmers?: number;
};

type CaseRow = {
  id: string;
  crop: string | null;
  country: string | null;
  region: string | null;
  issue: string | null;
  status: string;
  confirmed: boolean;
  guest: boolean;
  createdAt: string;
  questionType: string;
};

type InsightsPayload = {
  insights?: {
    users: {
      total: number;
      guests: number;
      registered: number;
      active: number;
      activeToday?: number;
      activeWeek?: number;
    };
    activity: {
      messages: number;
      imageAnalyses: number;
      cases: number;
      photosUploaded?: number;
      averageMessagesPerUser?: number;
      guestCases?: number;
      registeredCases?: number;
      usageLimitEvents: number;
      upgradeViews: number;
      upgradeClicks: number;
      promoAttempts: number;
      promoSuccesses: number;
    };
    summary?: {
      totalMessages: number;
      totalCropCases: number;
      uniqueGuestSessions: number;
      registeredUsers: number;
      photosUploaded: number;
      activeUsersToday: number;
      activeUsersThisWeek: number;
      averageMessagesPerUser: number;
      voiceNotes?: number;
    };
    today?: {
      farmers: number;
      messages: number;
      cases: number;
      photos: number;
      voiceNotes: number;
      webResearchedAnswers: number;
      newRegisteredFarmers?: number;
    };
    last7Days?: {
      uniqueFarmers: number;
      returningFarmers: number;
      messages: number;
      cropCases: number;
      photos?: number;
      voiceNotes?: number;
      followUps?: number;
      solved?: number;
    };
    last30Days?: {
      uniqueFarmers: number;
      returningFarmers: number;
      messages: number;
      cropCases: number;
      photos?: number;
      voiceNotes?: number;
      followUps?: number;
      solved?: number;
    };
    cropIntelligence?: {
      topCrops: Array<{ crop: string; cases: number; farmers: number; changeVsPrevious?: string }>;
      topIssues: {
        symptoms: CountRow[];
        suspectedProblems: CountRow[];
        confirmedProblems: CountRow[];
      };
      severity?: CountRow[];
      outcomes?: CountRow[];
    };
    researchCoverage?: Array<{
      country: string;
      pesticideRegistry: string;
      weather: string;
      marketData: string;
      officialAgriculture: string;
      lastVerifiedDate: string | null;
      status: string;
    }>;
    pesticideIntelligence?: {
      pesticideQuestions: number;
      productsSearched: CountRow[];
      activeIngredientsSearched: CountRow[];
      countriesWithVerifiedCoverage: string[];
      countriesWithMissingCoverage: string[];
      failedVerificationSearches: number;
      mostCommonTreatmentRequests: CountRow[];
    };
    engagement?: {
      guest: number;
      registered: number;
      messagesPerFarmer: number;
      averageConversationLength: number;
      returningUsers: number;
      casesWithFollowUp: number;
      followupResponseRate: number;
      casesSolved: number;
      casesImproved: number;
      unresolved: number;
      photoUsage: number;
      voiceUsage: number;
      followupByStatus: CountRow[];
    };
    questionTypes?: CountRow[];
    usage?: {
      messagesPerDay: CountRow[];
      casesPerDay: CountRow[];
      photosPerDay: CountRow[];
      newUsers: CountRow[];
      guestVsRegistered: CountRow[];
      mostActiveTimes: CountRow[];
    };
    webResearch?: {
      answersUsingWeb: number;
      totalResearchCalls: number;
      mostUsedSources: CountRow[];
      sourceFailures: CountRow[];
      outdatedSourceAlerts: CountRow[];
    };
    cases?: CaseRow[];
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
      casesByFarmerLevel?: CountRow[];
      emergingTrends?: TrendRow[];
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
            <span>
              {row.label}
              {row.status ? ` (${row.status})` : ""}
            </span>
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

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

export function AdminInsightsView({ section = "overview" }: { section?: string }) {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [crop, setCrop] = useState("");
  const [issue, setIssue] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [caseType, setCaseType] = useState("");
  const [status, setStatus] = useState("");
  const [userKind, setUserKind] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [resolved, setResolved] = useState("");
  const [userType, setUserType] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (country.trim()) params.set("country", country.trim());
    if (region.trim()) params.set("region", region.trim());
    if (crop.trim()) params.set("crop", crop.trim());
    if (issue.trim()) params.set("issue", issue.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (caseType) params.set("caseType", caseType);
    if (status) params.set("status", status);
    if (userKind) params.set("userKind", userKind);
    if (confirmed) params.set("confirmed", confirmed);
    if (resolved) params.set("resolved", resolved);
    if (userType) params.set("userType", userType);
    const text = params.toString();
    return text ? `/api/admin/insights?${text}` : "/api/admin/insights";
  }, [
    country,
    region,
    crop,
    issue,
    from,
    to,
    caseType,
    status,
    userKind,
    confirmed,
    resolved,
    userType,
  ]);

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
  const summary = insights?.summary;
  return (
    <div>
      <form
        className="grid gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line md:grid-cols-3"
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
          Region
          <input
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
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
          Issue
          <input
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={issue}
            onChange={(event) => setIssue(event.target.value)}
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
          User type
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={userType}
            onChange={(event) => setUserType(event.target.value)}
          >
            <option value="">All</option>
            <option value="home">Home</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label className="text-sm">
          Guest / registered
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={userKind}
            onChange={(event) => setUserKind(event.target.value)}
          >
            <option value="">All</option>
            <option value="guest">Guest</option>
            <option value="registered">Registered</option>
          </select>
        </label>
        <label className="text-sm">
          Confirmed
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={confirmed}
            onChange={(event) => setConfirmed(event.target.value)}
          >
            <option value="">All</option>
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
          </select>
        </label>
        <label className="text-sm">
          Resolved
          <select
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
            value={resolved}
            onChange={(event) => setResolved(event.target.value)}
          >
            <option value="">All</option>
            <option value="resolved">Resolved</option>
            <option value="unresolved">Unresolved</option>
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
      {insights && agronomy && summary ? (
        <div className="mt-6 space-y-6">
          {section === "overview" ? (
          <>
          <section>
            <h2 className="mb-2 font-semibold">Today</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Card label="Unique farmers" value={insights.today?.farmers ?? 0} />
              <Card label="Messages" value={insights.today?.messages ?? 0} />
              <Card label="Cases" value={insights.today?.cases ?? 0} />
              <Card label="Photos" value={insights.today?.photos ?? 0} />
              <Card label="Voice notes" value={insights.today?.voiceNotes ?? 0} />
              <Card label="New registered farmers" value={insights.today?.newRegisteredFarmers ?? 0} />
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Last 7 days</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card label="Unique farmers" value={insights.last7Days?.uniqueFarmers ?? 0} />
              <Card label="Returning farmers" value={insights.last7Days?.returningFarmers ?? 0} />
              <Card label="Messages" value={insights.last7Days?.messages ?? 0} />
              <Card label="Cases" value={insights.last7Days?.cropCases ?? 0} />
              <Card label="Photos" value={insights.last7Days?.photos ?? 0} />
              <Card label="Voice notes" value={insights.last7Days?.voiceNotes ?? 0} />
              <Card label="Follow-ups" value={insights.last7Days?.followUps ?? 0} />
              <Card label="Solved cases" value={insights.last7Days?.solved ?? 0} />
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Last 30 days</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card label="Unique farmers" value={insights.last30Days?.uniqueFarmers ?? 0} />
              <Card label="Returning farmers" value={insights.last30Days?.returningFarmers ?? 0} />
              <Card label="Messages" value={insights.last30Days?.messages ?? 0} />
              <Card label="Cases" value={insights.last30Days?.cropCases ?? 0} />
              <Card label="Photos" value={insights.last30Days?.photos ?? 0} />
              <Card label="Voice notes" value={insights.last30Days?.voiceNotes ?? 0} />
              <Card label="Follow-ups" value={insights.last30Days?.followUps ?? 0} />
              <Card label="Solved cases" value={insights.last30Days?.solved ?? 0} />
            </div>
          </section>
          </>
          ) : null}
          {section === "overview" ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Total messages" value={summary.totalMessages} />
            <Card label="Total crop cases" value={summary.totalCropCases} />
            <Card label="Unique guest sessions" value={summary.uniqueGuestSessions} />
            <Card label="Registered users" value={summary.registeredUsers} />
          </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {section === "questions" ? (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
              <h2 className="font-semibold">What farmers are asking</h2>
              <Bars rows={insights.questionTypes ?? []} />
            </section>
            ) : null}
            {section === "overview" || section === "trends" ? (
            <>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Top crops</h2>
              {(insights.cropIntelligence?.topCrops ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-muted">No data</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {(insights.cropIntelligence?.topCrops ?? []).map((row) => (
                    <li key={row.crop}>
                      {row.crop || "Unknown"} — {row.farmers} farmers, {row.cases} cases
                      {row.changeVsPrevious ? ` · ${row.changeVsPrevious}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Top reported symptoms</h2>
              <Bars rows={agronomy.topSymptoms ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Top suspected problems</h2>
              <Bars rows={agronomy.topSuspectedIssues ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Confirmed problems</h2>
              <Bars rows={insights.cropIntelligence?.topIssues.confirmedProblems ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Severity</h2>
              <Bars rows={insights.cropIntelligence?.severity ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Outcomes</h2>
              <Bars rows={insights.cropIntelligence?.outcomes ?? []} />
            </section>
            </>
            ) : null}
            {section === "countries" ? (
            <>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Cases by country</h2>
              <Bars rows={agronomy.casesByCountry ?? agronomy.problemsByCountry} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Cases by region</h2>
              <Bars rows={agronomy.casesByRegion ?? agronomy.problemsByDistrict} />
            </section>
            </>
            ) : null}
            {section === "farmers" ? (
            <>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Farmer type</h2>
              <Bars rows={agronomy.casesByFarmerLevel ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Guest vs registered</h2>
              <Bars rows={insights.usage?.guestVsRegistered ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Farmer engagement</h2>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Guest: {insights.engagement?.guest ?? 0}</li>
                <li>Registered: {insights.engagement?.registered ?? 0}</li>
                <li>Messages / farmer: {insights.engagement?.messagesPerFarmer ?? 0}</li>
                <li>Avg conversation length: {insights.engagement?.averageConversationLength ?? 0}</li>
                <li>Returning farmers: {insights.engagement?.returningUsers ?? 0}</li>
                <li>Photo usage: {insights.engagement?.photoUsage ?? 0}</li>
                <li>Voice usage: {insights.engagement?.voiceUsage ?? 0}</li>
                <li>Follow-up response rate: {insights.engagement?.followupResponseRate ?? 0}%</li>
                <li>Solved: {insights.engagement?.casesSolved ?? 0}</li>
                <li>Improved: {insights.engagement?.casesImproved ?? 0}</li>
                <li>Unresolved: {insights.engagement?.unresolved ?? 0}</li>
              </ul>
            </section>
            </>
            ) : null}
            {section === "overview" ? (
            <>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Messages per day</h2>
              <Bars rows={insights.usage?.messagesPerDay ?? []} />
            </section>
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-semibold">Cases per day</h2>
              <Bars rows={insights.usage?.casesPerDay ?? []} />
            </section>
            </>
            ) : null}
            {section === "trends" ? (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
              <h2 className="font-semibold">Emerging crop problems</h2>
              <p className="mt-1 text-xs text-muted">
                Trends count unique farmers, not messages from one person. Never labelled as an outbreak until reviewed.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="py-1">Trend</th>
                      <th>Farmers</th>
                      <th>First seen</th>
                      <th>Last seen</th>
                      <th>Country / region</th>
                      <th>Confidence</th>
                      <th>Reviewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agronomy.emergingTrends ?? []).map((trend) => (
                      <tr key={trend.label} className="border-t border-line">
                        <td className="py-2">{trend.label}</td>
                        <td>{trend.uniqueFarmers ?? trend.count}</td>
                        <td>{trend.firstSeen?.slice(0, 10) ?? "—"}</td>
                        <td>{trend.lastSeen?.slice(0, 10) ?? "—"}</td>
                        <td>
                          {[trend.country, trend.region].filter(Boolean).join(" / ") || "Unknown"}
                        </td>
                        <td>{trend.confidence ?? "—"}</td>
                        <td>{trend.reviewed ? "Reviewed" : "Not reviewed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(agronomy.emergingTrends ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No multi-farmer trends yet.</p>
                ) : null}
              </div>
            </section>
            ) : null}
            {section === "research" ? (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
              <h2 className="font-semibold">Research coverage by country</h2>
              <p className="mt-1 text-xs text-muted">
                Verified means an official source is configured. Missing does not invent coverage.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="py-1">Country</th>
                      <th>Pesticide registry</th>
                      <th>Weather</th>
                      <th>Market data</th>
                      <th>Official agriculture</th>
                      <th>Last verified</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(insights.researchCoverage ?? []).map((row) => (
                      <tr key={row.country} className="border-t border-line">
                        <td className="py-2">{row.country}</td>
                        <td>{row.pesticideRegistry}</td>
                        <td>{row.weather}</td>
                        <td>{row.marketData}</td>
                        <td>{row.officialAgriculture}</td>
                        <td>{row.lastVerifiedDate?.slice(0, 10) ?? "—"}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            ) : null}
            {section === "follow-ups" ? (
            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
              <h2 className="font-semibold">Follow-ups</h2>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Cases with follow-up: {insights.engagement?.casesWithFollowUp ?? 0}</li>
                <li>Follow-up response rate: {insights.engagement?.followupResponseRate ?? 0}%</li>
                <li>Solved: {insights.engagement?.casesSolved ?? 0}</li>
                <li>Improved: {insights.engagement?.casesImproved ?? 0}</li>
                <li>Unresolved: {insights.engagement?.unresolved ?? 0}</li>
              </ul>
              <p className="mt-3 text-xs font-medium text-muted">Follow-up status</p>
              <Bars rows={insights.engagement?.followupByStatus ?? []} />
            </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
