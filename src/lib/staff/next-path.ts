export function safeStaffNextPath(next?: string | null): string {
  if (!next) return "/staff";
  if (next === "/admin/login") return "/admin/insights";
  if (next === "/staff/login") return "/staff";
  if (next.startsWith("/staff") || next.startsWith("/admin")) return next;
  return "/staff";
}
