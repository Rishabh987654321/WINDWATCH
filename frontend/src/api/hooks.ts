import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { apiClient, ApiError, unwrapResponse } from "./client";
import type { paths } from "./schema";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

const defaultQueryOptions = {
  staleTime: FIVE_MINUTES_MS,
  placeholderData: keepPreviousData,
  retry: shouldRetry,
};

// 1. useMeta
export type MetaResponse =
  paths["/api/v1/meta"]["get"]["responses"][200]["content"]["application/json"];

export function useMeta(): UseQueryResult<MetaResponse, ApiError> {
  return useQuery<MetaResponse, ApiError>({
    queryKey: ["meta"],
    queryFn: () => unwrapResponse(apiClient.GET("/api/v1/meta")),
    ...defaultQueryOptions,
  });
}

// 2. useSeries
export type SeriesQueryParams =
  paths["/api/v1/series"]["get"]["parameters"]["query"];
export type SeriesResponse =
  paths["/api/v1/series"]["get"]["responses"][200]["content"]["application/json"];

export function useSeries(
  params?: SeriesQueryParams
): UseQueryResult<SeriesResponse, ApiError> {
  return useQuery<SeriesResponse, ApiError>({
    queryKey: ["series", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/series", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 3. useDayAhead
export type DayAheadPathParams =
  paths["/api/v1/day-ahead/{delivery_date}"]["get"]["parameters"]["path"];
export type DayAheadQueryParams =
  paths["/api/v1/day-ahead/{delivery_date}"]["get"]["parameters"]["query"];
export type DayAheadResponse =
  paths["/api/v1/day-ahead/{delivery_date}"]["get"]["responses"][200]["content"]["application/json"];

export function useDayAhead(
  deliveryDate: string,
  params?: DayAheadQueryParams
): UseQueryResult<DayAheadResponse, ApiError> {
  return useQuery<DayAheadResponse, ApiError>({
    queryKey: ["dayAhead", deliveryDate, params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/day-ahead/{delivery_date}", {
          params: {
            path: { delivery_date: deliveryDate },
            query: params,
          },
        })
      ),
    enabled: Boolean(deliveryDate),
    ...defaultQueryOptions,
  });
}

// 4. useCalibration
export type CalibrationQueryParams =
  paths["/api/v1/day-ahead/calibration"]["get"]["parameters"]["query"];
export type CalibrationResponse =
  paths["/api/v1/day-ahead/calibration"]["get"]["responses"][200]["content"]["application/json"];

export function useCalibration(
  params?: CalibrationQueryParams
): UseQueryResult<CalibrationResponse, ApiError> {
  return useQuery<CalibrationResponse, ApiError>({
    queryKey: ["calibration", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/day-ahead/calibration", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 5. useSummary
export type SummaryQueryParams =
  paths["/api/v1/metrics/summary"]["get"]["parameters"]["query"];
export type SummaryResponse =
  paths["/api/v1/metrics/summary"]["get"]["responses"][200]["content"]["application/json"];

export function useSummary(
  params?: SummaryQueryParams
): UseQueryResult<SummaryResponse, ApiError> {
  return useQuery<SummaryResponse, ApiError>({
    queryKey: ["summary", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/summary", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 6. useByHorizon
export type ByHorizonQueryParams =
  paths["/api/v1/metrics/by-horizon"]["get"]["parameters"]["query"];
export type ByHorizonResponse =
  paths["/api/v1/metrics/by-horizon"]["get"]["responses"][200]["content"]["application/json"];

export function useByHorizon(
  params?: ByHorizonQueryParams
): UseQueryResult<ByHorizonResponse, ApiError> {
  return useQuery<ByHorizonResponse, ApiError>({
    queryKey: ["byHorizon", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/by-horizon", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 7. useByHour
export type ByHourQueryParams =
  paths["/api/v1/metrics/by-hour"]["get"]["parameters"]["query"];
export type ByHourResponse =
  paths["/api/v1/metrics/by-hour"]["get"]["responses"][200]["content"]["application/json"];

export function useByHour(
  params?: ByHourQueryParams
): UseQueryResult<ByHourResponse, ApiError> {
  return useQuery<ByHourResponse, ApiError>({
    queryKey: ["byHour", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/by-hour", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 8. useByLevel
export type ByLevelQueryParams =
  paths["/api/v1/metrics/by-level"]["get"]["parameters"]["query"];
export type ByLevelResponse =
  paths["/api/v1/metrics/by-level"]["get"]["responses"][200]["content"]["application/json"];

export function useByLevel(
  params?: ByLevelQueryParams
): UseQueryResult<ByLevelResponse, ApiError> {
  return useQuery<ByLevelResponse, ApiError>({
    queryKey: ["byLevel", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/by-level", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 9. useDistribution
export type DistributionQueryParams =
  paths["/api/v1/metrics/distribution"]["get"]["parameters"]["query"];
export type DistributionResponse =
  paths["/api/v1/metrics/distribution"]["get"]["responses"][200]["content"]["application/json"];

export function useDistribution(
  params?: DistributionQueryParams
): UseQueryResult<DistributionResponse, ApiError> {
  return useQuery<DistributionResponse, ApiError>({
    queryKey: ["distribution", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/distribution", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 10. useHeatmap
export type HeatmapQueryParams =
  paths["/api/v1/metrics/heatmap"]["get"]["parameters"]["query"];
export type HeatmapResponse =
  paths["/api/v1/metrics/heatmap"]["get"]["responses"][200]["content"]["application/json"];

export function useHeatmap(
  params?: HeatmapQueryParams
): UseQueryResult<HeatmapResponse, ApiError> {
  return useQuery<HeatmapResponse, ApiError>({
    queryKey: ["heatmap", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/metrics/heatmap", {
          params: { query: params },
        })
      ),
    ...defaultQueryOptions,
  });
}

// 11. useVintages
export type VintagesQueryParams =
  paths["/api/v1/vintages"]["get"]["parameters"]["query"];
export type VintagesResponse =
  paths["/api/v1/vintages"]["get"]["responses"][200]["content"]["application/json"];

export function useVintages(
  params: VintagesQueryParams
): UseQueryResult<VintagesResponse, ApiError> {
  return useQuery<VintagesResponse, ApiError>({
    queryKey: ["vintages", params],
    queryFn: () =>
      unwrapResponse(
        apiClient.GET("/api/v1/vintages", {
          params: { query: params },
        })
      ),
    enabled: Boolean(params?.target),
    ...defaultQueryOptions,
  });
}
