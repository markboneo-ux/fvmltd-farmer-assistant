/** Dedicated staff sign-in for the insights dashboard. Not linked from farmer UI. */
export const STAFF_DASHBOARD_LOGIN_PATH = "/admin/login";
export const STAFF_QUEUE_LOGIN_PATH = "/staff/login";
export const STAFF_DASHBOARD_HOME_PATH = "/admin/insights";
export const STAFF_QUEUE_HOME_PATH = "/staff";

export const STAFF_LOGIN_API_PATH = "/api/staff/login";

export function isStaffLoginPath(pathname: string): boolean {
  return pathname === STAFF_DASHBOARD_LOGIN_PATH || pathname === STAFF_QUEUE_LOGIN_PATH;
}

export function isStaffLoginApiPath(pathname: string): boolean {
  return pathname === STAFF_LOGIN_API_PATH;
}

export function staffLoginPathFor(targetPath: string): string {
  if (targetPath === "/admin" || targetPath.startsWith("/admin/")) {
    return STAFF_DASHBOARD_LOGIN_PATH;
  }
  return STAFF_QUEUE_LOGIN_PATH;
}
