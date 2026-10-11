import { Loader2, Youtube } from "lucide-react";

export function LoadingState() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Spinner header */}
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="relative">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
        <p className="text-sm font-medium text-ink-600">
          Searching YouTube and ranking results...
        </p>
      </div>

      {/* Skeleton cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Thumbnail skeleton */}
            <div className="aspect-video shimmer-bg" />

            <div className="p-4 space-y-3">
              {/* Title */}
              <div className="space-y-1.5">
                <div className="h-4 rounded shimmer-bg w-full" />
                <div className="h-4 rounded shimmer-bg w-3/4" />
              </div>

              {/* Channel */}
              <div className="h-3 rounded shimmer-bg w-1/2" />

              {/* Stats */}
              <div className="flex gap-4">
                <div className="h-3 rounded shimmer-bg w-16" />
                <div className="h-3 rounded shimmer-bg w-16" />
                <div className="h-3 rounded shimmer-bg w-16" />
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-ink-100 bg-ink-50 p-3 space-y-1.5">
                <div className="h-3 rounded shimmer-bg w-20" />
                <div className="h-3 rounded shimmer-bg w-full" />
                <div className="h-3 rounded shimmer-bg w-5/6" />
              </div>

              {/* Ranking bars */}
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j}>
                    <div className="h-1.5 rounded-full shimmer-bg" />
                    <div className="mt-0.5 h-2 rounded shimmer-bg w-12" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600">
            <Youtube className="h-8 w-8 text-white" />
          </div>
          <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-brand-600 bg-white rounded-full" />
        </div>
        <p className="text-sm font-medium text-ink-500">Loading...</p>
      </div>
    </div>
  );
}
