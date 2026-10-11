import { useState, useCallback, useMemo } from "react";
import {
  Youtube,
  Sparkles,
  TrendingUp,
  GraduationCap,
  FileText,
  Star,
} from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { VideoCard } from "@/components/VideoCard";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState, ErrorState, DemoBanner } from "@/components/States";
import { SummaryModal } from "@/components/SummaryModal";
import { searchVideos } from "@/lib/api";
import type { SearchResponse, SearchStatus, VideoResult, SummaryResult } from "@/types";

function App() {
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [currentQuery, setCurrentQuery] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);

  // Summary cache: videoId -> SummaryResult
  const [summaryCache, setSummaryCache] = useState<Map<string, SummaryResult>>(new Map());
  const [modalVideo, setModalVideo] = useState<VideoResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    setCurrentQuery(query);
    setStatus("loading");
    setHasSearched(true);
    setError("");

    // Clear summary cache on new search
    setSummaryCache(new Map());

    try {
      const result = await searchVideos(query);
      setData(result);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setStatus("error");
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (currentQuery) {
      handleSearch(currentQuery);
    }
  }, [currentQuery, handleSearch]);

  const handleSummaryClick = useCallback((video: VideoResult) => {
    setModalVideo(video);
    setModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleSummaryCached = useCallback((videoId: string, summary: SummaryResult) => {
    setSummaryCache((prev) => {
      const next = new Map(prev);
      next.set(videoId, summary);
      return next;
    });
  }, []);

  const modalCachedSummary = useMemo(() => {
    if (!modalVideo) return null;
    return summaryCache.get(modalVideo.id) ?? null;
  }, [modalVideo, summaryCache]);

  return (
    <div className="min-h-screen bg-ink-50">
      {/* ── Header ─────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          hasSearched
            ? "bg-white/80 backdrop-blur-lg border-b border-ink-200 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <button
            onClick={() => {
              setStatus("idle");
              setHasSearched(false);
              setData(null);
              setCurrentQuery("");
              setSummaryCache(new Map());
            }}
            className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-lg shadow-brand-600/20">
              <Youtube className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-sm font-bold text-ink-900 leading-tight">
                AI Learning Assistant
              </h1>
              <p className="text-[10px] text-ink-500 leading-tight">YouTube video discovery</p>
            </div>
          </button>

          {hasSearched && (
            <div className="hidden max-w-xl flex-1 mx-8 sm:block">
              <SearchBar onSearch={handleSearch} loading={status === "loading"} initialValue={currentQuery} />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                data?.mode === "demo"
                  ? "bg-accent-50 text-accent-600"
                  : "bg-success-50 text-success-600"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${data?.mode === "demo" ? "bg-accent-500" : "bg-success-500"}`} />
              {data?.mode === "demo" ? "Demo" : "Live"}
            </span>
          </div>
        </div>

        {hasSearched && (
          <div className="block sm:hidden px-4 pb-3">
            <SearchBar onSearch={handleSearch} loading={status === "loading"} initialValue={currentQuery} />
          </div>
        )}
      </header>

      {/* ── Hero (only before first search) ────────────────── */}
      {!hasSearched && (
        <section className="relative overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-200/30 blur-3xl" />
            <div className="absolute -top-20 -left-40 h-80 w-80 rounded-full bg-accent-200/20 blur-3xl" />
            <div className="absolute top-40 right-1/3 h-64 w-64 rounded-full bg-brand-100/40 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:pt-32 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 backdrop-blur-sm px-4 py-1.5 text-xs font-medium text-ink-600 mb-6 animate-fade-in">
              <Sparkles className="h-3.5 w-3.5 text-brand-600" />
              AI-powered video ranking and summaries
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink-900 leading-[1.1] animate-fade-in-up">
              Learn anything from
              <span className="block bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                YouTube's best videos
              </span>
            </h1>

            <p className="mt-6 text-lg text-ink-600 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: "100ms" }}>
              Enter any topic or question and get relevant YouTube learning videos ranked by
              quality and engagement, complete with AI-generated summaries.
            </p>

            {/* Search */}
            <div className="mt-10 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <SearchBar onSearch={handleSearch} loading={status === "loading"} />
            </div>

            {/* Feature pills */}
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl mx-auto animate-fade-in-up" style={{ animationDelay: "300ms" }}>
              {[
                {
                  icon: TrendingUp,
                  title: "Quality Ranking",
                  desc: "Videos scored by relevance, engagement, popularity & freshness",
                },
                {
                  icon: FileText,
                  title: "AI Summaries",
                  desc: "Gemini-powered summaries with clickable timestamps",
                },
                {
                  icon: GraduationCap,
                  title: "Student-Friendly",
                  desc: "Find the right learning content fast, without the noise",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col items-center text-center p-5 rounded-2xl border border-ink-200 bg-white/60 backdrop-blur-sm"
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                    <f.icon className="h-5 w-5 text-brand-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-900">{f.title}</h3>
                  <p className="mt-1 text-xs text-ink-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Results ────────────────────────────────────────── */}
      {hasSearched && (
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Demo banner */}
          {status === "success" && data?.mode === "demo" && data.message && (
            <div className="mb-6">
              <DemoBanner message={data.message} />
            </div>
          )}

          {/* Results header */}
          {status === "success" && data && data.videos.length > 0 && (
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink-900">
                  Results for "{data.query}"
                </h2>
                <p className="text-sm text-ink-500">
                  {data.videos.length} video{data.videos.length > 1 ? "s" : ""} found
                  {data.mode === "live" && " · Ranked by AI score"}
                </p>
              </div>
            </div>
          )}

          {/* Content states */}
          {status === "loading" && <LoadingState />}

          {status === "error" && <ErrorState message={error} onRetry={handleRetry} />}

          {status === "success" && data && data.videos.length === 0 && (
            <EmptyState query={data.query} />
          )}

          {status === "success" && data && data.videos.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.videos.map((video, i) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  index={i}
                  isDemo={data.mode === "demo"}
                  onSummaryClick={handleSummaryClick}
                  hasCachedSummary={summaryCache.has(video.id)}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {/* ── Summary Modal ──────────────────────────────────── */}
      {modalVideo && (
        <SummaryModal
          video={modalVideo}
          topic={currentQuery}
          isOpen={modalOpen}
          onClose={handleModalClose}
          cachedSummary={modalCachedSummary}
          onSummaryCached={handleSummaryCached}
        />
      )}

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
                <Youtube className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm text-ink-500">
                AI YouTube Learning Assistant
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-400">
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                Ranked by quality & engagement
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                AI summaries via Gemini
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
