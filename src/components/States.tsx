import { SearchX, AlertCircle, Info } from "lucide-react";

interface EmptyStateProps {
  query: string;
}

export function EmptyState({ query }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-ink-100">
        <SearchX className="h-10 w-10 text-ink-400" />
      </div>
      <h3 className="text-lg font-semibold text-ink-800">No videos found</h3>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        We couldn't find any YouTube videos for "{query}". Try rephrasing your topic or
        searching for something more specific.
      </p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-error-50">
        <AlertCircle className="h-10 w-10 text-error-500" />
      </div>
      <h3 className="text-lg font-semibold text-ink-800">Something went wrong</h3>
      <p className="mt-2 max-w-md text-sm text-ink-500">{message}</p>
      <button
        onClick={onRetry}
        className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/20 active:scale-95"
      >
        Try Again
      </button>
    </div>
  );
}

interface DemoBannerProps {
  message: string;
}

export function DemoBanner({ message }: DemoBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4 animate-slide-down">
      <Info className="h-5 w-5 flex-shrink-0 text-accent-600 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-accent-700">Demo Mode Active</p>
        <p className="mt-0.5 text-xs text-accent-600">{message}</p>
      </div>
    </div>
  );
}
