import createClient from "openapi-fetch";
import type { paths } from "./schema";

export interface ApiErrorPayload {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  request_id?: string;
  invalid_params?: Array<{ name: string; reason: string }>;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly requestId?: string;
  readonly payload?: ApiErrorPayload;

  constructor(
    status: number,
    title?: string,
    detail?: string,
    requestId?: string,
    payload?: ApiErrorPayload
  ) {
    super(detail || title || `HTTP error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.title = title || `HTTP ${status}`;
    this.detail = detail || "An unexpected error occurred.";
    this.requestId = requestId;
    this.payload = payload;
  }
}

// Support Vite proxy, jsdom/test environments, and production base URLs
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL;
const defaultOrigin =
  typeof window !== "undefined" &&
  window.location?.origin &&
  window.location.origin !== "null" &&
  !window.location.origin.startsWith("about:")
    ? window.location.origin
    : "http://localhost:8000";

// If VITE_API_BASE_URL is "/api", strip it because schema paths already start with "/api/v1"
export const baseUrl =
  rawBaseUrl === "/api"
    ? defaultOrigin
    : (rawBaseUrl || defaultOrigin);

export const apiClient = createClient<paths>({
  baseUrl,
  fetch: (...args) => globalThis.fetch(...args),
});

/**
 * Helper to unwrap openapi-fetch result and parse RFC 7807 problem+json into ApiError.
 */
export async function unwrapResponse<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
  const { data, error, response } = await promise;

  if (!response.ok || error !== undefined) {
    const requestId =
      response.headers.get("X-Request-ID") || undefined;
    let title = response.statusText || `HTTP ${response.status}`;
    let detail = "An unexpected error occurred.";
    let payload: ApiErrorPayload | undefined;

    if (error && typeof error === "object") {
      payload = error as ApiErrorPayload;
      if (typeof payload.title === "string") title = payload.title;
      if (typeof payload.detail === "string") detail = payload.detail;
      if (typeof payload.request_id === "string" && !requestId) {
        // Fall back to request_id in body if header not present
      }
    }

    throw new ApiError(
      response.status,
      title,
      detail,
      requestId || payload?.request_id,
      payload
    );
  }

  return data as T;
}
