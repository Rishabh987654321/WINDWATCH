import { describe, it, expect } from "vitest";
import { ApiError, unwrapResponse } from "../api/client";
import { shouldRetry } from "../api/hooks";

describe("api client and error handling", () => {
  it("initializes ApiError with status, title, detail, and requestId", () => {
    const err = new ApiError(
      404,
      "Not Found",
      "No delivery forecasts found for date 2026-02-30",
      "req-12345"
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.title).toBe("Not Found");
    expect(err.detail).toBe("No delivery forecasts found for date 2026-02-30");
    expect(err.requestId).toBe("req-12345");
  });

  it("unwrapResponse returns data on ok response", async () => {
    const mockData = { status: "ok", reliable_horizon_hours: 44 };
    const promise = Promise.resolve({
      data: mockData,
      response: new Response(JSON.stringify(mockData), { status: 200 }),
    });

    const result = await unwrapResponse(promise);
    expect(result).toEqual(mockData);
  });

  it("unwrapResponse throws ApiError with problem+json payload on HTTP error", async () => {
    const problemPayload = {
      type: "urn:problem:not-found",
      title: "Snapshot Not Found",
      status: 404,
      detail: "The requested snapshot partition does not exist",
      request_id: "trace-abc-789",
    };

    const headers = new Headers();
    headers.set("X-Request-ID", "header-trace-xyz");

    const promise = Promise.resolve({
      error: problemPayload,
      response: new Response(JSON.stringify(problemPayload), {
        status: 404,
        statusText: "Not Found",
        headers,
      }),
    });

    await expect(unwrapResponse(promise)).rejects.toThrowError(ApiError);

    try {
      await unwrapResponse(promise);
    } catch (e: unknown) {
      const apiErr = e as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.title).toBe("Snapshot Not Found");
      expect(apiErr.detail).toBe("The requested snapshot partition does not exist");
      expect(apiErr.requestId).toBe("header-trace-xyz");
    }
  });

  it("shouldRetry does NOT retry on 4xx status codes", () => {
    const err400 = new ApiError(400, "Bad Request", "Invalid parameters");
    const err404 = new ApiError(404, "Not Found", "Missing data");
    const err422 = new ApiError(422, "Unprocessable Entity", "Validation error");

    expect(shouldRetry(0, err400)).toBe(false);
    expect(shouldRetry(0, err404)).toBe(false);
    expect(shouldRetry(0, err422)).toBe(false);
  });

  it("shouldRetry retries once on 5xx or network errors", () => {
    const err500 = new ApiError(500, "Internal Server Error", "Database timeout");
    const networkErr = new Error("Failed to fetch");

    // First failure (failureCount = 0) -> retry
    expect(shouldRetry(0, err500)).toBe(true);
    expect(shouldRetry(0, networkErr)).toBe(true);

    // Second failure (failureCount = 1) -> do not retry further
    expect(shouldRetry(1, err500)).toBe(false);
    expect(shouldRetry(1, networkErr)).toBe(false);
  });
});
