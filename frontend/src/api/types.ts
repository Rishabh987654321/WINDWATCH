import type { components, paths } from "./schema";

export type Schema = components["schemas"];

export type MetaResponse = Schema["MetaResponse"];
export type MetaData = Schema["MetaData"];
export type MetaDefaults = Schema["MetaDefaults"];
export type MetaCoverage = Schema["MetaCoverage"];

export type SeriesResponse = Schema["SeriesResponse"];
export type SeriesPoint = Schema["SeriesPoint"];
export type SeriesQueryEcho = Schema["SeriesQueryEcho"];

export type DayAheadResponse = Schema["DayAheadResponse"];
export type DayAheadPeriod = Schema["DayAheadPeriod"];
export type DayAheadSummary = Schema["DayAheadSummary"];
export type DayAccuracy = Schema["DayAccuracy"];
export type RiskMeta = Schema["RiskMeta"];

export type CalibrationResponse = Schema["CalibrationResponse"];
export type CalibrationDay = Schema["CalibrationDay"];

export type SummaryResponse = Schema["SummaryResponse"];
export type ByHorizonResponse = Schema["ByHorizonResponse"];
export type ByHorizonPoint = Schema["ByHorizonPoint"];
export type ByHourResponse = Schema["ByHourResponse"];
export type ByHourPoint = Schema["ByHourPoint"];
export type ByLevelResponse = Schema["ByLevelResponse"];
export type ByLevelPoint = Schema["ByLevelPoint"];
export type DistributionResponse = Schema["DistributionResponse"];
export type DistributionBin = Schema["DistributionBin"];
export type DistributionQuantiles = Schema["DistributionQuantiles"];
export type ExtremeErrorPoint = Schema["ExtremeErrorPoint"];
export type HeatmapResponse = Schema["HeatmapResponse"];
export type VintagesResponse = Schema["VintagesResponse"];
export type VintageForecastPoint = Schema["VintageForecastPoint"];

export type CoverageStats = Schema["CoverageStats"];
export type TimeRange = Schema["TimeRange"];

export type { paths };
