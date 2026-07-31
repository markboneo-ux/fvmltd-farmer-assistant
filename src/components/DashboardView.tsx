"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { farmer as demoFarmer, recentChecks } from "@/data/placeholder";
import {
  FARMER_SESSION_KEY,
  loadRegisteredFarmer,
} from "@/lib/farmers/session";
import type { RegisteredFarmer } from "@/lib/farmers/types";

const severityTone = {
  low: "low",
  mild: "mild",
  moderate: "moderate",
} as const;

function formatFarmSize(farmer: RegisteredFarmer): string {
  const size = Number.isInteger(farmer.farmSize)
    ? String(farmer.farmSize)
    : farmer.farmSize.toFixed(2).replace(/\.?0+$/, "");
  return `${size} ${farmer.farmSizeUnit}`;
}

function subscribeFarmerSession(onStoreChange: () => void) {
  const handler = (event: StorageEvent) => {
    if (event.key === FARMER_SESSION_KEY || event.key === null) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getFarmerSnapshot(): RegisteredFarmer | null {
  return loadRegisteredFarmer();
}

function getServerFarmerSnapshot(): RegisteredFarmer | null {
  return null;
}

export function DashboardView() {
  const farmer = useSyncExternalStore(
    subscribeFarmerSession,
    getFarmerSnapshot,
    getServerFarmerSnapshot,
  );

  const displayName = farmer?.fullName ?? demoFarmer.name;
  const locationLine = farmer
    ? `${farmer.district}, ${farmer.country} · ${formatFarmSize(farmer)}`
    : `${demoFarmer.village} · ${demoFarmer.farmSize}`;
  const farmerCode = farmer?.farmerCode ?? demoFarmer.id;
  const crops = farmer?.mainCrops?.length
    ? farmer.mainCrops.join(", ")
    : demoFarmer.primaryCrops.join(", ");

  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.14em] text-leaf uppercase">
              FVMLTD
            </p>
            <Link
              href="/staff"
              className="text-xs font-medium text-muted underline-offset-2 hover:text-canopy hover:underline"
            >
              Staff view
            </Link>
          </div>
          <p className="text-sm text-muted">
            {farmer ? "Welcome," : "Good morning,"}
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-muted">{locationLine}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-xl bg-surface px-3 py-1.5 text-xs font-semibold text-canopy ring-1 ring-line">
              Farmer ID · {farmerCode}
            </span>
            {!farmer ? (
              <Link
                href="/register"
                className="text-xs font-semibold text-leaf underline-offset-2 hover:underline"
              >
                Register your farm
              </Link>
            ) : null}
          </div>
          {farmer ? (
            <p className="mt-2 text-xs text-muted">Main crops: {crops}</p>
          ) : null}
        </header>

        <section className="animate-rise-delay mb-6 rounded-2xl bg-canopy px-4 py-5 text-white">
          <p className="text-xs font-semibold tracking-[0.12em] text-mint uppercase">
            Next action
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold">
            Check a crop today
          </h2>
          <p className="mt-1.5 text-sm text-white/85">
            Capture plant photos and get guidance before issues spread across the
            plot.
          </p>
          <div className="mt-4">
            <Button href="/crop-check" className="bg-sun text-soil hover:bg-[#f0c25d]">
              Start crop check
            </Button>
          </div>
        </section>

        <section className="animate-rise-late mb-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">
              Recent checks
            </h2>
            <Link href="/results" className="text-xs font-semibold text-leaf">
              See all
            </Link>
          </div>
          {farmer ? (
            <div className="rounded-2xl bg-surface/90 px-4 py-4 ring-1 ring-line">
              <p className="text-sm font-semibold text-ink">No crop checks yet</p>
              <p className="mt-1 text-sm text-muted">
                Start your first check to see results and recommendations here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentChecks.map((check) => (
                <li key={check.id}>
                  <Link
                    href="/results"
                    className="block rounded-2xl bg-surface/90 px-4 py-3 ring-1 ring-line transition hover:ring-leaf-bright"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{check.crop}</p>
                        <p className="mt-0.5 text-xs text-muted">{check.date}</p>
                      </div>
                      <StatusPill
                        label={check.status}
                        tone={severityTone[check.severity]}
                      />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {check.summary}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3">
          <Link
            href="/chat"
            className="rounded-2xl bg-surface px-3 py-4 ring-1 ring-line transition hover:ring-leaf-bright"
          >
            <p className="text-sm font-semibold text-ink">AI assistant</p>
            <p className="mt-1 text-xs text-muted">Ask about symptoms</p>
          </Link>
          <Link
            href="/upload"
            className="rounded-2xl bg-surface px-3 py-4 ring-1 ring-line transition hover:ring-leaf-bright"
          >
            <p className="text-sm font-semibold text-ink">Upload photos</p>
            <p className="mt-1 text-xs text-muted">Add field images</p>
          </Link>
        </section>

        <div className="-mx-4 mt-auto">
          <BottomNav active="/dashboard" />
        </div>
      </div>
    </AppShell>
  );
}
