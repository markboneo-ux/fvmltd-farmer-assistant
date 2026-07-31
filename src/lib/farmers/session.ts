import type { RegisteredFarmer } from "./types";

export const FARMER_SESSION_KEY = "fvmltd_registered_farmer";

export function saveRegisteredFarmer(farmer: RegisteredFarmer): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FARMER_SESSION_KEY, JSON.stringify(farmer));
}

export function loadRegisteredFarmer(): RegisteredFarmer | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(FARMER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegisteredFarmer;
    if (!parsed?.id || !parsed?.farmerCode || !parsed?.fullName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearRegisteredFarmer(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FARMER_SESSION_KEY);
}
