
import { useState } from "react";
import {
  Play,
  ThumbsUp,
  Eye,
  MessageCircle,
  ExternalLink,
  Clock,
  TrendingUp,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import type { VideoResult } from "@/types";
import {
  formatCount,
  formatDuration,
  timeAgo,
  scoreColor,
} from "@/lib/format";

interface VideoCardProps {
  video: VideoResult;
  index: number;
  isDemo: boolean;
  onSummaryClick: (video: VideoResult) => void;
  hasCachedSummary: boolean;
}

export function VideoCard({
  video,
  index,
  isDemo,
  onSummaryClick,
  hasCachedSummary,
}: VideoCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(video.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy the link. Please copy the URL manually.");
    }
  };

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-ink-900/10 hover:border-ink-300 animate-fade-in-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Thumbnail */}
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-video overflow-hidden bg-ink-100"
      >
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ink-200">
            <Play className="h-10 w-10 text-ink-400" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-ink-900/0 transition-colors duration-300 group-hover:bg-ink-900/30">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg opacity-0 scale-90 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100">
            <Play
              className="h-6 w-6 text-brand-600 ml-1"
              fill="currentColor"
            />
          </div>
        </div>

        {/* Rank badge */}
        <div className="absolute top-3 left-3 flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900/80 text-sm font-bold text-white backdrop-blur-sm">
          #{index + 1}
        </div>

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-ink-900/80 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Clock className="h-3 w-3" />
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Score badge */}
        <div
          className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold backdrop-blur-sm ${scoreColor(
            video.rankingScore
          )}`}
        >
          <TrendingUp className="h-3 w-3" />
          {video.rankingScore}
        </div>
      </a>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Video title */}
        <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 transition-colors"
          >
            {video.title}
          </a>
        </h3>

        {/* Channel and publication date */}
        <p className="mb-3 text-xs text-ink-500">
          {video.channel} · {timeAgo(video.publishedAt)}
        </p>

        {/* YouTube URL + Copy Link */}
        <div className="mb-3 flex min-w-0 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 p-2">
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            title={video.url}
            className="min-w-0 flex-1 truncate text-xs text-brand-600 hover:underline"
          >
            {video.url}
          </a>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex shrink-0 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100"
            title="Copy YouTube link"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Link
              </>
            )}
          </button>
        </div>

        {/* Statistics */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          {video.views !== null && (
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {formatCount(video.views)} views
            </span>
          )}

          {video.likes !== null && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5" />
              {formatCount(video.likes)}
            </span>
          )}

          {video.comments !== null && (
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              {formatCount(video.comments)}
            </span>
          )}

          {video.views === null &&
            video.likes === null &&
            video.comments === null && (
              <span className="text-ink-400 italic">
                Statistics unavailable
              </span>
            )}
        </div>

        {/* Ranking breakdown */}
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500">
              Ranking Breakdown
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              {
                label: "Relevance",
                value: video.rankingBreakdown.relevance,
              },
              {
                label: "Engage",
                value: video.rankingBreakdown.engagement,
              },
              {
                label: "Popular",
                value: video.rankingBreakdown.popularity,
              },
              {
                label: "Fresh",
                value: video.rankingBreakdown.freshness,
              },
            ].map((m) => (
              <div key={m.label}>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${m.value}%` }}
                  />
                </div>
                <span className="mt-0.5 block text-[10px] text-ink-400">
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-2">
          <button
            onClick={() => onSummaryClick(video)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
              hasCachedSummary
                ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                : "bg-brand-600 text-white hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/20"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {hasCachedSummary ? "View Summary" : "Summary"}
          </button>

          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-ink-600 transition-colors hover:text-brand-600"
          >
            Watch
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
