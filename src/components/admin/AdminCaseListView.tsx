"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CaseRow = {
  id: string;
  crop: string | null;
  country: string | null;
  district?: string | null;
  intent: string | null;
  caseStatus: string;
  farmerProblemText: string;
  needsReview: boolean;
};

export function AdminCaseListView() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [crop, setCrop] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (country.trim()) params.set("country", country.trim());
    if (region.trim()) params.set("region", region.trim());
    if (crop.trim()) params.set("crop", crop.trim());
    const query = params.toString();
    void (async () => {
      const response = await fetch(query ? `/api/admin/cases?${query}` : "/api/admin/cases");
      const payload = (await response.json()) as { cases?: CaseRow[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not load cases.");
        return;
      }
      setError(null);
      setRows(payload.cases ?? []);
    })();
  }, [q, country, region, crop]);

  return (
    <div>
      <form className="grid gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line md:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
        <label className="text-sm">
          Search
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-line px-2"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Crop, problem, country"
          />
        </label>
        <label className="text-sm">
          Country
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-line px-2"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Region
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-line px-2"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          />
        </label>
        <label className="text-sm">
          Crop
          <input
            className="mt-1 min-h-11 w-full rounded-lg border border-line px-2"
            value={crop}
            onChange={(event) => setCrop(event.target.value)}
          />
        </label>
      </form>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <Link className="font-medium text-canopy" href={`/admin/cases/${row.id}`}>
              {row.crop || "Unknown crop"} · {row.country || "Unknown"}
            </Link>
            <p className="text-sm text-muted">
              {row.intent || "Unconfirmed"} · {row.caseStatus}
              {row.needsReview ? " · needs review" : ""}
            </p>
            <p className="mt-1 text-sm">{row.farmerProblemText}</p>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !error ? (
        <p className="mt-4 text-sm text-muted">No cases match those filters.</p>
      ) : null}
    </div>
  );
}
