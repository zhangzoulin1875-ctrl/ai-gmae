// API and Socket configuration helper
// In dev: uses Vite proxy (relative paths)
// In prod: uses VITE_API_URL / VITE_SOCKET_URL env vars

const API_BASE = import.meta.env.VITE_API_URL || '';
const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL || '';

export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getSocketUrl(): string {
  return SOCKET_BASE || undefined;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(getApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}
