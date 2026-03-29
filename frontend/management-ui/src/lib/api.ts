/** API base URL — baked in at build time via NEXT_PUBLIC_API_URL.
 *  Empty string means same-origin (for reverse proxy setups).
 *  Set to e.g. "http://10.0.0.4:8891" for direct access. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function api(path: string): string {
  return `${API_BASE}${path}`;
}
