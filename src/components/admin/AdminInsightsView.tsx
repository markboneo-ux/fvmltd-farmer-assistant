"use client";

import { useEffect, useState } from "react";

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
      problemsByCrop: Array<{ label: string; count: number }>;
      problemsByCountry: Array<{ label: string; count: number }>;
      problemsByDistrict: Array<{ label: string; count: number }>;
      problemsByVariety: Array<{ label: string; count: number }>;
      problemsByWeek: Array<{ label: string; count: number }>;
      mostReportedPest: { label: string; count: number } | null;
      mostReportedDisease: { label: string; count: number } | null;
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
    };
  };
  trends?: Array<{ label: string; count: number; classification: string }>;
  error?: string;
};

function Bars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex justify-between text-sm">
            <span>{row.label}</span>
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

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/insights");
      const payload = (await response.json()) as InsightsPayload;
      if (!response.ok) {
        setError(payload.error || "Could not load insights.");
        return;
      }
      setData(payload);
    })();
  }, []);

  const insights = data?.insights;
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">FVMLTD insights</h1>
      <p className="mt-1 text-sm text-muted">Internal only. Farmer identities are not shown.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      {insights ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">User metrics</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Total users: {insights.users.total}</li>
              <li>Guest users: {insights.users.guests}</li>
              <li>Registered users: {insights.users.registered}</li>
              <li>Active users: {insights.users.active}</li>
              <li>Messages: {insights.activity.messages}</li>
              <li>Image analyses: {insights.activity.imageAnalyses}</li>
              <li>Cases: {insights.activity.cases}</li>
              <li>Usage-limit events: {insights.activity.usageLimitEvents}</li>
              <li>Upgrade clicks: {insights.activity.upgradeClicks}</li>
              <li>Promo redemptions: {insights.activity.promoSuccesses}</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Agronomic outcomes</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Stunting: {insights.agronomy.stunting}</li>
              <li>Wilting: {insights.agronomy.wilting}</li>
              <li>Nutrient-related: {insights.agronomy.nutrientRelated}</li>
              <li>Photo-assisted: {insights.agronomy.photoAssisted}</li>
              <li>Unresolved: {insights.agronomy.unresolved}</li>
              <li>Human escalations: {insights.agronomy.humanEscalations}</li>
              <li>Improved: {insights.agronomy.casesImproved}</li>
              <li>Unchanged: {insights.agronomy.casesUnchanged}</li>
              <li>Worsened: {insights.agronomy.casesWorsened}</li>
              <li>Problem solved: {insights.agronomy.problemSolved}</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Problems by crop</h2>
            <Bars rows={insights.agronomy.problemsByCrop} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Problems by district</h2>
            <Bars rows={insights.agronomy.problemsByDistrict} />
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line md:col-span-2">
            <h2 className="font-semibold">Trends</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {(data?.trends ?? []).map((trend) => (
                <li key={trend.label}>
                  {trend.label}: {trend.count} reports ({trend.classification.replaceAll("_", " ")})
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              A verified outbreak is never declared from AI reports alone.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
