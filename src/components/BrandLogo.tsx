"use client";

import { useState } from "react";

const LOGO_CANDIDATES = [
  "/brand/farmersvaluemart-logo.svg",
  "/brand/farmersvaluemart-logo.png",
];

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-9 w-9" }: BrandLogoProps) {
  const [index, setIndex] = useState(0);
  const src = LOGO_CANDIDATES[index];

  if (!src) {
    return (
      <div
        className={`flex ${className} items-center justify-center rounded-xl bg-canopy text-[0.65rem] font-semibold tracking-tight text-white`}
        aria-label="Farmersvaluemart logo placeholder — add public/brand/farmersvaluemart-logo.svg"
        title="Add the official logo at public/brand/farmersvaluemart-logo.svg"
      >
        FVM
      </div>
    );
  }

  return (
    // Official asset when present. Fallback is a labeled slot, not a replacement logo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Farmersvaluemart"
      className={`${className} rounded-xl object-contain`}
      onError={() => setIndex((current) => current + 1)}
    />
  );
}
