"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { RegistrationSuccess } from "@/components/RegistrationSuccess";
import { StatusPill } from "@/components/StatusPill";
import {
  formatPlantingDate,
  labelForEnvironment,
  labelForStage,
} from "@/lib/crop-cycles/labels";
import type { CropCycleRecord } from "@/lib/crop-cycles/types";
import { farmer as demoFarmer, recentChecks } from "@/data/placeholder";
import {
  clearJustRegistered,
  peekJustRegistered,
} from "@/lib/farmers/paths";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";
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

type CropsResult = {
  farmerId: string;
  crops: CropCycleRecord[];
  error: string | null;
};

export function DashboardView() {
  const farmer = useRegisteredFarmer();
  const [cropsResult, setCropsResult] = useState<CropsResult | null>(null);
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Read the just-registered flag after mount (sessionStorage is client-only).
    setShowRegistrationSuccess(peekJustRegistered());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!farmer?.id) return;

    const farmerId = farmer.id;
    let cancelled = false;

    fetch(`/api/crop-cycles?farmerId=${farmerId}&status=active`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          cropCycles?: CropCycleRecord[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setCropsResult({
            farmerId,
            crops: [],
            error: payload.error ?? "Could not load active crops.",
          });
          return;
        }
        setCropsResult({
          farmerId,
          crops: payload.cropCycles ?? [],
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCropsResult({
            farmerId,
            crops: [],
            error: "Could not load active crops.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [farmer?.id]);

  function dismissRegistrationSuccess() {
    clearJustRegistered();
    setShowRegistrationSuccess(false);
  }

  if (!hydrated) {
    return (
      <AppShell bare>
        <div className="px-4 pt-6 text-sm text-muted">Loading dashboard…</div>
      </AppShell>
    );
  }

  if (showRegistrationSuccess) {
    return (
      <AppShell bare>
        <div className="flex min-h-dvh flex-col px-4 pt-6 pb-8">
          <RegistrationSuccess
            farmerCode={farmer?.farmerCode}
            fullName={farmer?.fullName}
            pending={!farmer}
            onContinue={dismissRegistrationSuccess}
            continueLabel="Continue"
          />
        </div>
      </AppShell>
    );
  }

  const displayName = farmer?.fullName ?? demoFarmer.name;
  const locationLine = farmer
    ? `${farmer.district}, ${farmer.country} · ${formatFarmSize(farmer)}`
    : `${demoFarmer.village} · ${demoFarmer.farmSize}`;
  const farmerCode = farmer?.farmerCode ?? demoFarmer.id;

  const cropsMatch = Boolean(
    farmer?.id && cropsResult?.farmerId === farmer.id,
  );
  const activeCrops = cropsMatch ? cropsResult!.crops : [];
  const cropsError = cropsMatch ? cropsResult!.error : null;
  const cropsLoading = Boolean(farmer?.id) && !cropsMatch;

  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.14em] text-canopy uppercase">
              Farmers Value Mart Ltd
            </p>
            <span className="rounded-md bg-canopy px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white">
              Farming Forward
            </span>
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
        </header>

        {farmer ? (
          <section className="animate-rise-delay mb-4 grid grid-cols-2 gap-3">
            <Button href="/farms/new" variant="secondary">
              Add farm
            </Button>
            <Button href="/crop-cycles/new" variant="secondary">
              Add crop cycle
            </Button>
          </section>
        ) : null}

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

        <section className="animate-rise-late mb-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">
              Active crops
            </h2>
            {farmer ? (
              <Link
                href="/crop-cycles/new"
                className="text-xs font-semibold text-leaf"
              >
                New cycle
              </Link>
            ) : null}
          </div>

          {!farmer ? (
            <div className="rounded-2xl bg-surface/90 px-4 py-4 ring-1 ring-line">
              <p className="text-sm font-semibold text-ink">Ask the AI first</p>
              <p className="mt-1 text-sm text-muted">
                Open the Farmer Assistant now — registration is optional and
                never required to chat.
              </p>
              <div className="mt-3 space-y-2">
                <Button href="/">Get started</Button>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-canopy underline-offset-4 hover:underline"
                >
                  Create a farmer profile
                </Link>
              </div>
            </div>
          ) : cropsLoading ? (
            <p className="text-sm text-muted">Loading active crops…</p>
          ) : cropsError ? (
            <div className="rounded-2xl bg-danger/10 px-4 py-4 text-sm text-danger ring-1 ring-danger/30">
              {cropsError}
            </div>
          ) : activeCrops.length === 0 ? (
            <div className="rounded-2xl bg-surface/90 px-4 py-4 ring-1 ring-line">
              <p className="text-sm font-semibold text-ink">No active crops yet</p>
              <p className="mt-1 text-sm text-muted">
                Add a farm, then create a crop cycle to see it on your dashboard.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button href="/farms/new" variant="secondary">
                  Add farm
                </Button>
                <Button href="/crop-cycles/new">Add crop cycle</Button>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {activeCrops.map((cycle) => (
                <li
                  key={cycle.id}
                  className="rounded-2xl bg-surface/90 px-4 py-3 ring-1 ring-line"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{cycle.cropName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {cycle.farmName}
                        {cycle.variety ? ` · ${cycle.variety}` : ""}
                      </p>
                    </div>
                    <StatusPill
                      label={labelForStage(cycle.growthStage)}
                      tone="mild"
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {formatPlantingDate(cycle.plantingDate)} ·{" "}
                    {labelForEnvironment(cycle.growingEnvironment)}
                    {cycle.areaPlanted != null && cycle.areaUnit
                      ? ` · ${cycle.areaPlanted} ${cycle.areaUnit}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-4">
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
