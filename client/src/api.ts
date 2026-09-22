// When running in Vite dev server (port 5173), direct browser requests to backend port 3050
// to avoid Vite Node proxy sandbox restrictions. When served directly from Express (:3050), use relative paths.
export const API_BASE = typeof window !== 'undefined' && window.location.port === '5173'
  ? 'http://localhost:3050'
  : '';

export function apiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE}${cleanEndpoint}`;
}
