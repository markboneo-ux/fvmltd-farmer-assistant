"use client";

import { useSyncExternalStore } from "react";
import {
  FARMER_SESSION_KEY,
  loadRegisteredFarmer,
} from "@/lib/farmers/session";
import type { RegisteredFarmer } from "@/lib/farmers/types";

function subscribe(onStoreChange: () => void) {
  const handler = (event: StorageEvent) => {
    if (event.key === FARMER_SESSION_KEY || event.key === null) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSnapshot(): RegisteredFarmer | null {
  return loadRegisteredFarmer();
}

function getServerSnapshot(): RegisteredFarmer | null {
  return null;
}

export function useRegisteredFarmer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
