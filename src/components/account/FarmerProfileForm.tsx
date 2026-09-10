"use client";

import { useEffect, useState } from "react";
import { AccountShell } from "@/components/account/AccountShell";

type Profile = {
  fullName: string;
  email: string | null;
  country: string | null;
  district: string | null;
  farmerType: string | null;
  primaryCrops: string[];
  farmSize: number | null;
  farmSizeUnit: string | null;
  avatarUrl: string | null;
};

const FARMER_TYPES = [
  { id: "", label: "Prefer not to say" },
  { id: "home_gardener", label: "Home gardener" },
  { id: "small_farmer", label: "Small farmer" },
  { id: "commercial_farmer", label: "Commercial farmer" },
  { id: "agronomist", label: "Agronomist" },
  { id: "extension_officer", label: "Extension officer" },
];

export function FarmerProfileForm({ countries }: { countries: string[] }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cropsText, setCropsText] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/account/profile");
      const payload = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "Log in to view your profile.");
        return;
      }
      if (payload.profile) {
        setProfile(payload.profile);
        setCropsText(payload.profile.primaryCrops.join(", "));
      }
    })();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: profile.fullName,
          country: profile.country,
          district: profile.district,
          farmerType: profile.farmerType || null,
          primaryCrops: cropsText,
          farmSize: profile.farmSize,
          farmSizeUnit: profile.farmSizeUnit,
        }),
      });
      const payload = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t save your profile. Please try again.");
        return;
      }
      if (payload.profile) setProfile(payload.profile);
      setMessage("Saved.");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function uploadAvatar(file: File) {
    setPending(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const payload = (await response.json()) as { profile?: Profile; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t save that photo.");
        return;
      }
      if (payload.profile) setProfile(payload.profile);
      setMessage("Profile picture updated.");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!profile) {
    return (
      <AccountShell title="My Profile">
        <p className="text-sm text-muted">{message || "Loading…"}</p>
      </AccountShell>
    );
  }

  return (
    <AccountShell title="My Profile">
      <form className="space-y-4" onSubmit={save}>
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-sky ring-1 ring-line">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-canopy">
                {(profile.fullName || "F").slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <label className="min-h-11 cursor-pointer rounded-full bg-surface px-4 text-sm font-medium text-canopy ring-1 ring-line">
            <span className="inline-flex min-h-11 items-center">Change photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAvatar(file);
              }}
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-ink">
          Name
          <input
            value={profile.fullName}
            onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            value={profile.email ?? ""}
            disabled
            className="mt-1 min-h-12 w-full rounded-xl bg-sky px-3 text-muted ring-1 ring-line"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Country
          <select
            value={profile.country ?? ""}
            onChange={(event) => setProfile({ ...profile, country: event.target.value || null })}
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          >
            <option value="">Not set yet</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Area / district
          <input
            value={profile.district ?? ""}
            onChange={(event) => setProfile({ ...profile, district: event.target.value })}
            placeholder="Caroni, Penal, Berbice…"
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Farmer type
          <select
            value={profile.farmerType ?? ""}
            onChange={(event) => setProfile({ ...profile, farmerType: event.target.value || null })}
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          >
            {FARMER_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          Main crops
          <input
            value={cropsText}
            onChange={(event) => setCropsText(event.target.value)}
            placeholder="Hot pepper, tomato"
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Approximate farm size
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min="0"
              step="0.1"
              value={profile.farmSize ?? ""}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  farmSize: event.target.value ? Number(event.target.value) : null,
                })
              }
              className="min-h-12 flex-1 rounded-xl bg-surface px-3 ring-1 ring-line"
            />
            <select
              value={profile.farmSizeUnit ?? "acres"}
              onChange={(event) => setProfile({ ...profile, farmSizeUnit: event.target.value })}
              className="min-h-12 rounded-xl bg-surface px-3 ring-1 ring-line"
            >
              <option value="acres">acres</option>
              <option value="hectares">hectares</option>
            </select>
          </div>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-full bg-canopy text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        {message ? <p className="text-sm text-ink">{message}</p> : null}
        <p className="text-xs text-muted">
          None of these are required. Add them when they help us give better advice.
        </p>
      </form>
    </AccountShell>
  );
}
