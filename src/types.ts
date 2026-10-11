export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnail: string;
  publishedAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration: string | null;
  rankingScore: number;
  rankingBreakdown: {
    relevance: number;
    engagement: number;
    popularity: number;
    freshness: number;
  };
  url: string;
}

export interface SearchResponse {
  query: string;
  videos: VideoResult[];
  mode: "live" | "demo";
  message?: string;
  rankingWeights?: {
    relevance: number;
    engagement: number;
    popularity: number;
    freshness: number;
  };
}

export type SearchStatus = "idle" | "loading" | "success" | "error";

// ── Summary types ────────────────────────────────────────────────────────

export interface SummaryPoint {
  timestamp: number; // seconds
  text: string;
}

export type TranscriptSource = "youtube_captions" | "audio_transcription" | "user_provided";

export interface SummaryResult {
  videoId: string;
  summary: string;
  points: SummaryPoint[];
  transcriptSource: TranscriptSource;
  available: boolean;
  message?: string;
  mode?: "live" | "demo";
}

export interface SummaryRequest {
  videoId: string;
  videoTitle: string;
  topic: string;
  transcript?: string;
}

export interface TranscribeRequest {
  filePath: string;
  videoId: string;
  videoTitle: string;
  topic: string;
}

export type SummaryStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "unavailable";

export type FallbackTab = "audio" | "text";
