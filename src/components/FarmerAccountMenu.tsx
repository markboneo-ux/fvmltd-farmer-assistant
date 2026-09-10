"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type AccountIdentity = {
  signedIn: boolean;
  email: string | null;
  displayName: string | null;
  initials: string;
  avatarUrl: string | null;
  access?: string;
};

type FarmerAccountMenuProps = {
  identity: AccountIdentity | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
};

export function FarmerAccountMenu({
  identity,
  open,
  onToggle,
  onClose,
}: FarmerAccountMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  async function logOut() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onClose();
      router.refresh();
      window.location.href = "/";
    } finally {
      setLoggingOut(false);
    }
  }

  const signedIn = Boolean(identity?.signedIn);
  const label = signedIn
    ? identity?.displayName || identity?.email || "Signed in"
    : "Account";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-sky text-xs font-semibold text-canopy ring-1 ring-line hover:bg-white"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={signedIn ? `Account menu for ${label}` : "Account menu"}
        title={signedIn ? `Signed in as ${label}` : "Account"}
      >
        {identity?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : signedIn ? (
          <span aria-hidden>{identity?.initials || "F"}</span>
        ) : (
          personIcon()
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl bg-surface py-1 shadow-lg shadow-black/5 ring-1 ring-line/80"
        >
          {signedIn ? (
            <>
              <p className="truncate px-3 py-2 text-xs text-muted">
                Signed in{identity?.email ? ` as ${identity.email}` : ""}
              </p>
              <MenuLink href="/account/profile" onClick={onClose}>
                My Profile
              </MenuLink>
              <MenuLink href="/account/cases" onClick={onClose}>
                My Crop Cases
              </MenuLink>
              <MenuLink href="/account/follow-ups" onClick={onClose}>
                Follow-ups
              </MenuLink>
              <MenuLink href="/account/access" onClick={onClose}>
                Access
              </MenuLink>
              <button
                type="button"
                role="menuitem"
                disabled={loggingOut}
                onClick={() => void logOut()}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-ink hover:bg-sky disabled:opacity-50"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <MenuLink href="/signin" onClick={onClose}>
                Create Free Account
              </MenuLink>
              <MenuLink href="/signin?mode=login" onClick={onClose}>
                Log In
              </MenuLink>
              <button
                type="button"
                role="menuitem"
                onClick={onClose}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-ink hover:bg-sky"
              >
                Continue as Guest
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-ink hover:bg-sky"
    >
      {children}
    </Link>
  );
}

function personIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1.2-3.2 3.4-4.8 6.5-4.8S16.8 15.8 18.5 19" />
    </svg>
  );
}
