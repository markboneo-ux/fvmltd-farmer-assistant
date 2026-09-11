"use client";

import { useState } from "react";

type PasswordFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  className?: string;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  required = true,
  minLength,
  className = "mt-1 min-h-12 w-full rounded-xl bg-surface px-3 pr-12 ring-1 ring-line",
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? "password";

  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <span className="relative mt-1 block">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          name={id ?? "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
        <button
          type="button"
          onClick={() => setVisible((open) => !open)}
          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-sky hover:text-canopy"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? eyeOffIcon() : eyeIcon()}
        </button>
      </span>
    </label>
  );
}

function eyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function eyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 5.5 19.5 21" />
      <path d="M9.5 7.2A8.7 8.7 0 0 1 12 6.8c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.6" />
      <path d="M6.4 9.2A16.4 16.4 0 0 0 2.5 13.3S6 19.8 12 19.8c1.3 0 2.5-.3 3.6-.7" />
      <path d="M10.2 10.4a2.6 2.6 0 0 0 3.5 3.5" />
    </svg>
  );
}
