/**
 * Internal App Router paths for the farmer registration → dashboard flow.
 * Always use these relative paths — never absolute Vercel/preview/localhost URLs.
 */
export const FARMER_DASHBOARD_PATH = "/dashboard";

/** Query flag set after a successful registration redirect. */
export const REGISTERED_QUERY = "registered";

export function farmerDashboardHref(options?: { registered?: boolean }): string {
  if (options?.registered) {
    return `${FARMER_DASHBOARD_PATH}?${REGISTERED_QUERY}=1`;
  }
  return FARMER_DASHBOARD_PATH;
}
