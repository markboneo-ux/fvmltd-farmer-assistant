import { randomBytes } from "node:crypto";

/**
 * Generates a short, human-readable Farmer ID such as FVM-A1B2C3.
 * Uniqueness is enforced by the database unique constraint; callers should retry on conflict.
 */
export function generateFarmerCode(): string {
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `FVM-${suffix}`;
}
