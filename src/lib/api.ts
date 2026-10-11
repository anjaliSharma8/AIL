import type {
  SearchResponse,
  SummaryRequest,
  SummaryResult,
  TranscribeRequest,
} from "@/types";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SUPABASE_ANON_KEY) {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  return headers;
}

export async function searchVideos(query: string, maxResults = 8): Promise<SearchResponse> {
  const apiUrl = `${SUPABASE_URL}/functions/v1/youtube-search`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ query, maxResults }),
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) errorMessage = errorBody.error;
    } catch {
      // response body wasn't JSON
    }
    throw new Error(errorMessage);
  }

  const data = await response.json() as SearchResponse;

  if (!data || !Array.isArray(data.videos)) {
    throw new Error("Received an unexpected response format from the server.");
  }

  return data;
}

export async function fetchSummary(request: SummaryRequest): Promise<SummaryResult> {
  const apiUrl = `${SUPABASE_URL}/functions/v1/youtube-search/summary`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorMessage = `Summary request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) errorMessage = errorBody.error;
    } catch {
      // response body wasn't JSON
    }
    throw new Error(errorMessage);
  }

  const data = await response.json() as SummaryResult;

  if (!data || typeof data.available !== "boolean") {
    throw new Error("Received an unexpected response format from the server.");
  }

  if (data.videoId !== request.videoId) {
    throw new Error("Summary response does not match the selected video.");
  }

  return data;
}

// ── Audio upload + transcription ─────────────────────────────────────────

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export async function uploadAudioFile(file: File): Promise<string> {
  if (!supabase) {
    throw new Error("Storage is not configured.");
  }

  const ext = file.name.split(".").pop() || "mp3";
  const fileName = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("audio-uploads")
    .upload(fileName, file, {
      contentType: file.type || "audio/mpeg",
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return fileName;
}

export async function transcribeAudio(request: TranscribeRequest): Promise<SummaryResult> {
  const apiUrl = `${SUPABASE_URL}/functions/v1/youtube-search/transcribe`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorMessage = `Transcription request failed (${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) errorMessage = errorBody.error;
    } catch {
      // response body wasn't JSON
    }
    throw new Error(errorMessage);
  }

  const data = await response.json() as SummaryResult;

  if (!data || typeof data.available !== "boolean") {
    throw new Error("Received an unexpected response format from the server.");
  }

  if (data.videoId !== request.videoId) {
    throw new Error("Transcription response does not match the selected video.");
  }

  return data;
}
