"use client";

import { useSyncExternalStore } from "react";
import {
  FARMER_SESSION_CHANGE_EVENT,
  FARMER_SESSION_KEY,
  loadRegisteredFarmer,
} from "@/lib/farmers/session";
import type { RegisteredFarmer } from "@/lib/farmers/types";

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FARMER_SESSION_KEY || event.key === null) {
      onStoreChange();
    }
  };
  const onLocalChange = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(FARMER_SESSION_CHANGE_EVENT, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FARMER_SESSION_CHANGE_EVENT, onLocalChange);
  };
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
