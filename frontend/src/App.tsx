import React, { useEffect, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useMeta } from "./api/hooks";
import { useFilters } from "./store/filters";
import { TopBar } from "./components/shell/TopBar";
import { MarqueeTicker } from "./components/shell/MarqueeTicker";
import { FilterBar } from "./components/shell/FilterBar";
import { ErrorBoundary } from "./components/shell/ErrorBoundary";
import { Callout } from "./components/ui/Callout";
import { Button } from "./components/ui/Button";
import { Skeleton } from "./components/ui/Skeleton";
import {
  OverviewPage,
  DayAheadPage,
  AccuracyPage,
  MethodologyPage,
  UiKitPage,
  NotFoundPage,
} from "./routes";

const PageSkeleton: React.FC = () => (
  <div className="space-y-6" data-testid="page-skeleton">
    <div className="flex items-center justify-between">
      <Skeleton width={260} height={36} />
      <Skeleton width={120} height={28} variant="yellow" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Skeleton height={100} />
      <Skeleton height={100} />
      <Skeleton height={100} />
    </div>
    <Skeleton height={320} />
  </div>
);

const AppSkeleton: React.FC = () => (
  <div className="min-h-screen bg-[#FFFDF8] flex flex-col font-['Space_Grotesk']" data-testid="app-skeleton">
    <header className="bg-white border-b-[3px] border-[#111] h-16 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Skeleton width={140} height={36} variant="yellow" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton width={180} height={32} />
      </div>
    </header>
    <div className="border-b-[3px] border-[#111] bg-[#FFE94A] h-10 px-4 flex items-center">
      <Skeleton width="100%" height={20} variant="yellow" />
    </div>
    <div className="border-b-[3px] border-[#111] bg-[#FFF8E1] py-3 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex gap-4">
        <Skeleton width={220} height={40} />
        <Skeleton width={260} height={40} />
        <Skeleton width={180} height={40} />
      </div>
    </div>
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
      <PageSkeleton />
    </main>
  </div>
);

export default function App() {
  const { data: meta, isLoading, isError, error, refetch } = useMeta();
  const initFromMeta = useFilters((state) => state.initFromMeta);

  useEffect(() => {
    if (meta) {
      initFromMeta(meta);
    }
  }, [meta, initFromMeta]);

  if (isLoading) {
    return <AppSkeleton />;
  }

  if (isError || !meta) {
    return (
      <main className="min-h-screen bg-[#FFFDF8] flex items-center justify-center p-6 font-['Space_Grotesk']">
        <div className="max-w-md w-full">
          <Callout
            variant="pink"
            icon="⚠"
            title="Bootstrap Failed — /meta"
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => refetch()}
                className="mt-3"
              >
                RETRY
              </Button>
            }
          >
            <p className="font-bold mb-1">
              Could not load snapshot metadata from the WindWatch API.
            </p>
            <p className="text-xs text-[#5A5A5A] font-mono break-all">
              {error instanceof Error ? error.message : "Failed to fetch /api/v1/meta"}
            </p>
          </Callout>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="WindWatch Application Error">
      <BrowserRouter>
        {/* Skip to main content for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-[#FFE94A] focus:text-[#111] focus:px-4 focus:py-2 focus:border-2 focus:border-[#111] focus:font-bold focus:shadow-[3px_3px_0_#111]"
        >
          Skip to main content
        </a>

        <div className="min-h-screen bg-[#FFFDF8] text-[#111] flex flex-col font-['Space_Grotesk']">
          <TopBar meta={meta} />
          <MarqueeTicker />
          <FilterBar />

          <main
            id="main-content"
            className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6"
          >
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/day-ahead" element={<DayAheadPage />} />
                <Route path="/accuracy" element={<AccuracyPage />} />
                <Route path="/methodology" element={<MethodologyPage />} />
                {import.meta.env.DEV && (
                  <Route path="/_kit" element={<UiKitPage />} />
                )}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>

          <footer className="border-t-[3px] border-[#111] bg-white py-4 px-6 text-center text-xs font-mono text-[#5A5A5A]">
            WINDWATCH · UK DAY-AHEAD WIND FORECAST & ACCURACY BENCHMARK · BMRS ELEXON DATA · JANUARY 2026
          </footer>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
