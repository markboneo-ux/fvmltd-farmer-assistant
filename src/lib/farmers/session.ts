import type { RegisteredFarmer } from "./types";

export const FARMER_SESSION_KEY = "fvmltd_registered_farmer";

/** Same-tab signal — native `storage` events only fire across tabs. */
export const FARMER_SESSION_CHANGE_EVENT = "fvmltd-farmer-session-change";

function notifyFarmerSessionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FARMER_SESSION_CHANGE_EVENT));
}

export function saveRegisteredFarmer(farmer: RegisteredFarmer): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FARMER_SESSION_KEY, JSON.stringify(farmer));
  notifyFarmerSessionChange();
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
  notifyFarmerSessionChange();
}
