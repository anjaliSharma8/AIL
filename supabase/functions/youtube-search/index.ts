// AI YouTube Learning Assistant — Edge Function
// Searches YouTube, ranks results by a configurable score, and
// generates AI summaries of video transcripts via the Gemini API.
//
// Routes (single function, path-based):
//   POST /youtube-search          — search + rank videos (no summaries)
//   POST /youtube-search/summary  — on-demand summary for ONE video
//   POST /youtube-search/transcribe — transcribe uploaded audio via Gemini
//
// Transcript strategy (3-tier):
//   1. YouTube public caption tracks (embedded in watch page HTML)
//   2. User-uploaded audio file → Gemini audio transcription with timestamps
//   3. User-pasted transcript text (no timestamps)
//
// Required secrets (configured in Supabase project settings):
//   YOUTUBE_API_KEY  — YouTube Data API v3 key
//   GEMINI_API_KEY   — Google Gemini API key
//
// Required Supabase storage bucket:
//   audio-uploads — private bucket for temporary audio file storage

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Shared types ─────────────────────────────────────────────────────────

interface VideoResult {
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

interface TranscriptSegment {
  start: number;   // seconds
  text: string;
}

interface SummaryPoint {
  timestamp: number; // seconds
  text: string;
}

type TranscriptSource = "youtube_captions" | "audio_transcription" | "user_provided";

interface SummaryResponse {
  videoId: string;
  summary: string;
  points: SummaryPoint[];
  transcriptSource: TranscriptSource;
  available: boolean;
  message?: string;
}

interface SearchRequestBody {
  query: string;
  maxResults?: number;
}

interface SummaryRequestBody {
  videoId: string;
  videoTitle: string;
  topic: string;
  transcript?: string; // user-provided transcript (plain text)
}

interface TranscribeRequestBody {
  filePath: string;    // path within audio-uploads bucket
  videoId: string;
  videoTitle: string;
  topic: string;
}

// ── Ranking configuration ────────────────────────────────────────────────

const RANKING_WEIGHTS = {
  relevance: 0.30,
  engagement: 0.25,
  popularity: 0.30,
  freshness: 0.15,
};

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>): Response {
  return jsonResponse({ error: message, ...extra }, status);
}

function logNormalize(value: number, maxRef: number): number {
  if (value <= 0) return 0;
  return Math.min(Math.log10(value + 1) / Math.log10(maxRef + 1), 1);
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── YouTube Data API: search + details ───────────────────────────────────

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeVideoItem {
  id: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

async function searchYouTube(query: string, maxResults: number, apiKey: string): Promise<YouTubeSearchItem[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("videoEmbeddable", "true");

  const res = await fetch(searchUrl, {
    headers: { "X-Goog-Api-Key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.items || []) as YouTubeSearchItem[];
}

async function getVideoDetails(videoIds: string[], apiKey: string): Promise<Map<string, YouTubeVideoItem>> {
  if (videoIds.length === 0) return new Map();

  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "statistics,contentDetails");
  detailsUrl.searchParams.set("id", videoIds.join(","));

  const res = await fetch(detailsUrl, {
    headers: { "X-Goog-Api-Key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube video details failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const map = new Map<string, YouTubeVideoItem>();
  for (const item of (data.items || []) as YouTubeVideoItem[]) {
    map.set(item.id, item);
  }
  return map;
}

// ── Tier 1: YouTube public caption tracks ────────────────────────────────
// The YouTube Data API's captions.download endpoint requires OAuth2.
// Instead we fetch the public watch page HTML and extract the
// `captionTracks` JSON that YouTube embeds for the player.

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
  kind?: string;
}


async function getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    const res = await fetch(watchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.error("YouTube watch page failed:", res.status);
      return [];
    }

    const html = await res.text();

    const patterns = [
      /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"audioTracks"/,
      /"captionTracks"\s*:\s*(\[[\s\S]*?\])/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (!match) continue;

      try {
        const tracks = JSON.parse(match[1]) as CaptionTrack[];

        const validTracks = tracks.filter(
          (track) =>
            typeof track.baseUrl === "string" &&
            typeof track.languageCode === "string"
        );

        if (validTracks.length > 0) {
          console.log(
            `Found ${validTracks.length} caption tracks for video ${videoId}`
          );
          return validTracks;
        }
      } catch {
        // Try the next pattern.
      }
    }

    console.log(`No caption tracks extracted for video ${videoId}`);
    return [];
  } catch (error) {
    console.error("Caption extraction failed:", error);
    return [];
  }
}


function parseTimedTextXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const textRegex = /<text\s+start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const rawText = match[3]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (rawText) {
      segments.push({ start, text: rawText });
    }
  }

  return segments;
}

async function fetchTranscriptFromCaptions(videoId: string): Promise<{ segments: TranscriptSegment[] } | null> {
  try {
    const tracks = await getCaptionTracks(videoId);
    if (tracks.length === 0) return null;

    const engTrack = tracks.find((t) => t.languageCode.startsWith("en") && t.kind !== "asr");
    const engAsr = tracks.find((t) => t.languageCode.startsWith("en"));
    const track = engTrack || engAsr || tracks[0];

    const transcriptRes = await fetch(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!transcriptRes.ok) return null;

    const xml = await transcriptRes.text();
    const segments = parseTimedTextXml(xml);

    if (segments.length === 0) return null;

    return { segments };
  } catch {
    return null;
  }
}

// ── Tier 2: Audio transcription via Gemini ───────────────────────────────
// Gemini 1.5 Flash can accept audio files directly (inline base64 or
// via the Files API) and produce a transcript with timestamps. We
// download the audio from Supabase Storage, base64-encode it, and
// send it to Gemini with a prompt requesting timestamped segments.

async function downloadAudioFromStorage(filePath: string): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return null;

  const downloadUrl = `${supabaseUrl}/storage/v1/object/audio-uploads/${filePath}`;
  const res = await fetch(downloadUrl, {
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "audio/mpeg";
  const data = await res.arrayBuffer();
  return { data, mimeType: contentType };
}

async function deleteAudioFromStorage(filePath: string): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return;

  const deleteUrl = `${supabaseUrl}/storage/v1/object/audio-uploads/${filePath}`;
  await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
  });
}

function base64Encode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string,
  videoTitle: string,
  geminiKey: string
): Promise<TranscriptSegment[]> {
  const prompt = `You are a professional transcription service. Transcribe the audio from this video: "${videoTitle}".

Provide the transcription as a list of segments, each with a start time in seconds and the spoken text. Format each segment EXACTLY as:

[MM:SS] transcribed text here
[MM:SS] more text

Rules:
- Use [MM:SS] or [H:MM:SS] timestamps reflecting when each segment begins in the audio.
- Group spoken words into meaningful segments of roughly 5-15 seconds each.
- Do NOT skip any speech. Transcribe the full audio.
- If the audio is silent or has no speech, output: [00:00] (no speech detected)
- Do not add any text before or after the segments. Output ONLY the timestamped segments.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: audioBase64,
              },
            },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini audio transcription failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty transcription response.");

  return parseTranscriptionSegments(text);
}

function parseTranscriptionSegments(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const timePattern = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.+)/;

  for (const line of lines) {
    const match = line.match(timePattern);
    if (match) {
      const seconds = parseTimeToSeconds(match[1]);
      const segText = match[2].trim();
      if (segText && seconds >= 0) {
        segments.push({ start: seconds, text: segText });
      }
    }
  }

  return segments;
}

// ── Gemini API for timestamped summaries ─────────────────────────────────

function buildTranscriptForGemini(segments: TranscriptSegment[]): string {
  const chunks: string[] = [];
  let currentChunk = "";
  let chunkStart = segments[0]?.start ?? 0;

  for (const seg of segments) {
    if (seg.start - chunkStart >= 30) {
      chunks.push(`[${formatTimestamp(chunkStart)}] ${currentChunk.trim()}`);
      currentChunk = "";
      chunkStart = seg.start;
    }
    currentChunk += seg.text + " ";
  }
  if (currentChunk.trim()) {
    chunks.push(`[${formatTimestamp(chunkStart)}] ${currentChunk.trim()}`);
  }

  return chunks.join("\n").slice(0, 30000);
}

function buildTranscriptFromUserText(text: string): string {
  return text.slice(0, 30000);
}

function parseGeminiSummary(rawText: string): { summary: string; points: SummaryPoint[] } {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  let summary = "";
  const points: SummaryPoint[] = [];

  const summaryIdx = lines.findIndex((l) => /^summary:/i.test(l));
  const pointsIdx = lines.findIndex((l) => /^important points:/i.test(l));

  if (summaryIdx >= 0) {
    const summaryEnd = pointsIdx >= 0 ? pointsIdx : lines.length;
    summary = lines.slice(summaryIdx + 1, summaryEnd).join(" ").trim();
  }

  const timePattern = /(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?\s*[-:]?\s*(.+)/;
  const pointLines = pointsIdx >= 0 ? lines.slice(pointsIdx + 1) : (summaryIdx < 0 ? lines : []);

  for (const line of pointLines) {
    const cleaned = line.replace(/^[-*\d.)\]\s]+/, "").trim();
    const match = cleaned.match(timePattern);
    if (match) {
      const timeStr = match[1];
      const text = match[2].trim();
      const seconds = parseTimeToSeconds(timeStr);
      if (text && seconds >= 0) {
        points.push({ timestamp: seconds, text });
      }
    }
  }

  if (!summary && points.length === 0) {
    summary = rawText.trim();
  }

  return { summary, points };
}

function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return -1;
}

async function generateTimestampedSummary(
  transcriptText: string,
  videoTitle: string,
  topic: string,
  geminiKey: string,
  hasTimestamps: boolean
): Promise<{ summary: string; points: SummaryPoint[] }> {
  const timestampInstruction = hasTimestamps
    ? "The transcript segments are prefixed with [MM:SS] timestamps. Use ONLY these timestamps for your important points — do not invent timestamps."
    : "The transcript does not have timestamps. For the important points, use [00:00] as the timestamp for all points since exact timing is unavailable.";

  const prompt = `You are an expert learning assistant. A student searched for "${topic}" and found this YouTube video: "${videoTitle}".

Analyze the transcript below and provide:

Summary:
A concise 2-3 sentence summary of what the student will learn from this video and whether it is relevant to their topic.

Important Points:
List 4-8 key points from the video. Each point MUST start with a timestamp in [MM:SS] format (or [H:MM:SS] for longer videos) followed by a brief description of what is covered at that point.

${timestampInstruction}

Format your response EXACTLY as:

Summary:
<your summary here>

Important Points:
[MM:SS] <point description>
[MM:SS] <point description>
...

Transcript:
${transcriptText}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  return parseGeminiSummary(text);
}

// ── Ranking engine ──────────────────────────────────────────────────────

function computeRankingScore(
  query: string,
  video: {
    title: string;
    channelTitle: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    publishedAt: string;
  }
): { score: number; breakdown: VideoResult["rankingBreakdown"] } {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  const titleLower = video.title.toLowerCase();
  const channelLower = video.channelTitle.toLowerCase();
  const matchedWords = queryWords.filter(
    (w) => titleLower.includes(w) || channelLower.includes(w)
  );
  const relevance = queryWords.length > 0 ? matchedWords.length / queryWords.length : 0.5;

  let engagement = 0;
  if (video.views && video.likes && video.views > 0) {
    const ratio = video.likes / video.views;
    engagement = Math.min(ratio / 0.04, 1);
  }

  const popularity = video.views ? logNormalize(video.views, 10_000_000) : 0;

  let freshness = 0.5;
  if (video.publishedAt) {
    const published = new Date(video.publishedAt).getTime();
    const now = Date.now();
    const ageDays = (now - published) / (1000 * 60 * 60 * 24);
    if (ageDays <= 365) freshness = 1.0;
    else if (ageDays <= 730) freshness = 0.8;
    else if (ageDays <= 1095) freshness = 0.6;
    else if (ageDays <= 1825) freshness = 0.4;
    else freshness = 0.2;
  }

  const score =
    relevance * RANKING_WEIGHTS.relevance +
    engagement * RANKING_WEIGHTS.engagement +
    popularity * RANKING_WEIGHTS.popularity +
    freshness * RANKING_WEIGHTS.freshness;

  return {
    score: Math.round(score * 100),
    breakdown: {
      relevance: Math.round(relevance * 100),
      engagement: Math.round(engagement * 100),
      popularity: Math.round(popularity * 100),
      freshness: Math.round(freshness * 100),
    },
  };
}

// ── Demo mode ────────────────────────────────────────────────────────────

function generateDemoResults(query: string): { videos: VideoResult[]; mode: "demo" } {
  const demoVideos: Array<Partial<VideoResult> & { title: string; channel: string }> = [
    { id: "dQw4w9WgXcQ", title: `${query} — Complete Beginner's Guide (2024)`, channel: "EduTech Pro", views: 2_450_000, likes: 87_000, comments: 3_200, publishedAt: "2024-03-15T10:00:00Z", duration: "PT18M32S" },
    { id: "9bZkp7q19f0", title: `${query} Explained Simply — Full Course`, channel: "Learning Hub", views: 1_120_000, likes: 52_000, comments: 1_800, publishedAt: "2024-06-01T14:00:00Z", duration: "PT24M15S" },
    { id: "kJQP7kiw5Fk", title: `Understanding ${query}: Deep Dive Tutorial`, channel: "Code Academy", views: 890_000, likes: 41_000, comments: 950, publishedAt: "2023-11-20T09:00:00Z", duration: "PT31M48S" },
    { id: "OPf0YbXqDm0", title: `${query} for Students — Hands-On Workshop`, channel: "Student Lab", views: 540_000, likes: 28_000, comments: 670, publishedAt: "2024-08-10T12:00:00Z", duration: "PT15M20S" },
    { id: "RgKAFai5adc", title: `Master ${query} in 20 Minutes`, channel: "Quick Learn", views: 3_200_000, likes: 145_000, comments: 5_400, publishedAt: "2023-08-05T16:00:00Z", duration: "PT20M05S" },
    { id: "fJ9rUzIMcZQ", title: `${query} — Advanced Concepts and Real-World Examples`, channel: "Deep Dive Education", views: 410_000, likes: 22_000, comments: 480, publishedAt: "2024-01-22T11:00:00Z", duration: "PT42M10S" },
  ];

  const thumbnails = [
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=480&q=80",
    "https://images.unsplash.com/photo-1633356122544-f073ef04866d?w=480&q=80",
    "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=480&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=480&q=80",
    "https://images.unsplash.com/photo-1526379095098-4006606f4a47?w=480&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=480&q=80",
  ];

  const videos: VideoResult[] = demoVideos.map((v, i) => {
    const ranking = computeRankingScore(query, {
      title: v.title,
      channelTitle: v.channel,
      views: v.views ?? null,
      likes: v.likes ?? null,
      comments: v.comments ?? null,
      publishedAt: v.publishedAt || new Date().toISOString(),
    });

    return {
      id: v.id,
      title: v.title,
      channel: v.channel,
      channelId: "demo-channel",
      thumbnail: thumbnails[i],
      publishedAt: v.publishedAt!,
      views: v.views ?? null,
      likes: v.likes ?? null,
      comments: v.comments ?? null,
      duration: v.duration ?? null,
      rankingScore: ranking.score,
      rankingBreakdown: ranking.breakdown,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    };
  });

  videos.sort((a, b) => b.rankingScore - a.rankingScore);
  return { videos, mode: "demo" };
}

function generateDemoSummary(videoId: string, videoTitle: string, topic: string): SummaryResponse {
  const points: SummaryPoint[] = [
    { timestamp: 15, text: `Introduction to ${topic} and why it matters` },
    { timestamp: 85, text: "Core concepts explained with visual examples" },
    { timestamp: 210, text: "Step-by-step walkthrough of a practical example" },
    { timestamp: 360, text: "Common mistakes and how to avoid them" },
    { timestamp: 520, text: "Real-world applications and use cases" },
    { timestamp: 680, text: "Summary and recommended next steps for learning" },
  ];

  return {
    videoId,
    summary: `This video provides a comprehensive introduction to ${topic}. It covers the fundamental concepts with visual examples, walks through a practical demonstration, and discusses real-world applications. The content is well-structured and suitable for students looking for a thorough understanding of ${topic}.`,
    points,
    transcriptSource: "youtube_captions",
    available: true,
    message: "Demo mode: This is a sample summary with mock timestamps.",
  };
}

// ── Route: Summary (Tier 1 + Tier 3) ─────────────────────────────────────

async function handleSummaryRequest(req: Request, youtubeKey: string | undefined, geminiKey: string | undefined): Promise<Response> {
  const body = await req.json() as SummaryRequestBody;
  const { videoId, videoTitle, topic } = body;

  if (!videoId) {
    return errorResponse("videoId is required", 400);
  }

  // Demo mode
  if (!youtubeKey || !geminiKey) {
    const demo = generateDemoSummary(videoId, videoTitle || "this video", topic || "this topic");
    return jsonResponse({ ...demo, mode: "demo" });
  }

  // Tier 3: user-provided transcript text
  if (body.transcript && body.transcript.trim().length > 20) {
    try {
      const transcriptText = buildTranscriptFromUserText(body.transcript.trim());
      const result = await generateTimestampedSummary(
        transcriptText,
        videoTitle || "this video",
        topic || "this topic",
        geminiKey,
        false
      );

      return jsonResponse({
        videoId,
        summary: result.summary,
        points: result.points,
        transcriptSource: "user_provided" as const,
        available: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Summary generation failed";
      return errorResponse(message, 500);
    }
  }

  // Tier 1: YouTube public caption tracks
  const captionResult = await fetchTranscriptFromCaptions(videoId);

  if (captionResult && captionResult.segments.length > 0) {
    try {
      const transcriptText = buildTranscriptForGemini(captionResult.segments);
      const result = await generateTimestampedSummary(
        transcriptText,
        videoTitle || "this video",
        topic || "this topic",
        geminiKey,
        true
      );

      return jsonResponse({
        videoId,
        summary: result.summary,
        points: result.points,
        transcriptSource: "youtube_captions" as const,
        available: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Summary generation failed";
      return errorResponse(message, 500);
    }
  }

  // No captions available — tell the client to offer audio upload or text paste
  return jsonResponse({
    videoId,
    summary: "",
    points: [],
    transcriptSource: "youtube_captions" as const,
    available: false,
    message: "This video has no public captions or transcript. You can upload an audio file of the video (that you have permission to process) and we'll transcribe it with AI, or paste the transcript text manually.",
  });
}

// ── Route: Transcribe (Tier 2 — audio upload) ────────────────────────────

async function handleTranscribeRequest(req: Request, _youtubeKey: string | undefined, geminiKey: string | undefined): Promise<Response> {
  const body = await req.json() as TranscribeRequestBody;
  const { filePath, videoId, videoTitle, topic } = body;

  if (!filePath || !videoId) {
    return errorResponse("filePath and videoId are required", 400);
  }

  if (!geminiKey) {
    return errorResponse("Gemini API key is not configured. Cannot transcribe audio.", 503);
  }

  try {
    // Download audio from Supabase Storage
    const audioData = await downloadAudioFromStorage(filePath);
    if (!audioData) {
      return errorResponse("Could not download the audio file. It may have expired or been removed.", 404);
    }

    // Check size — Gemini inline_data has a practical limit (~20MB for base64)
    const sizeMB = audioData.data.byteLength / (1024 * 1024);
    if (sizeMB > 19) {
      // Clean up the file
      await deleteAudioFromStorage(filePath);
      return errorResponse(
        `Audio file is too large (${sizeMB.toFixed(1)} MB). The maximum supported size is 19 MB. Please use a shorter or more compressed audio file.`,
        413
      );
    }

    // Transcribe audio with Gemini
    const audioBase64 = base64Encode(audioData.data);
    const segments = await transcribeAudioWithGemini(audioBase64, audioData.mimeType, videoTitle || "this video", geminiKey);

    // Clean up the uploaded file
    await deleteAudioFromStorage(filePath);

    if (segments.length === 0) {
      return jsonResponse({
        videoId,
        summary: "",
        points: [],
        transcriptSource: "audio_transcription" as const,
        available: false,
        message: "The AI could not detect any speech in the uploaded audio. Please ensure the audio contains clear speech and try again, or paste the transcript text manually.",
      });
    }

    // Generate summary from the transcribed segments
    const transcriptText = buildTranscriptForGemini(segments);
    const result = await generateTimestampedSummary(
      transcriptText,
      videoTitle || "this video",
      topic || "this topic",
      geminiKey,
      true // timestamps available from transcription
    );

    return jsonResponse({
      videoId,
      summary: result.summary,
      points: result.points,
      transcriptSource: "audio_transcription" as const,
      available: true,
    });
  } catch (err) {
    // Best-effort cleanup
    await deleteAudioFromStorage(filePath);
    const message = err instanceof Error ? err.message : "Audio transcription failed";
    return errorResponse(message, 500);
  }
}

// ── Route: Search ────────────────────────────────────────────────────────

async function handleSearchRequest(req: Request, youtubeKey: string | undefined): Promise<Response> {
  const body = await req.json() as SearchRequestBody;
  const query = (body.query || "").trim();
  const maxResults = Math.min(body.maxResults || 8, 15);

  if (!query) {
    return errorResponse("Query is required", 400);
  }

  if (!youtubeKey) {
    const { videos, mode } = generateDemoResults(query);
    return jsonResponse({
      query,
      videos,
      mode,
      message: "Demo mode: YouTube API key not configured. Add YOUTUBE_API_KEY to your Supabase project secrets to enable live results.",
      rankingWeights: RANKING_WEIGHTS,
    });
  }

  const searchResults = await searchYouTube(query, maxResults, youtubeKey);

  if (searchResults.length === 0) {
    return jsonResponse({
      query,
      videos: [],
      mode: "live",
      message: "No videos found for your query. Try a different topic.",
      rankingWeights: RANKING_WEIGHTS,
    });
  }

  const videoIds = searchResults.map((s) => s.id.videoId).filter(Boolean);
  const detailsMap = await getVideoDetails(videoIds, youtubeKey);

  const results: VideoResult[] = searchResults.map((item) => {
    const details = detailsMap.get(item.id.videoId);
    const stats = details?.statistics;

    const views = stats?.viewCount ? parseInt(stats.viewCount, 10) : null;
    const likes = stats?.likeCount ? parseInt(stats.likeCount, 10) : null;
    const comments = stats?.commentCount ? parseInt(stats.commentCount, 10) : null;
    const duration = details?.contentDetails?.duration || null;

    const ranking = computeRankingScore(query, {
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      views,
      likes,
      comments,
      publishedAt: item.snippet.publishedAt,
    });

    return {
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      thumbnail:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        "",
      publishedAt: item.snippet.publishedAt,
      views,
      likes,
      comments,
      duration,
      rankingScore: ranking.score,
      rankingBreakdown: ranking.breakdown,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    };
  });

  results.sort((a, b) => b.rankingScore - a.rankingScore);

  return jsonResponse({
    query,
    videos: results,
    mode: "live" as const,
    rankingWeights: RANKING_WEIGHTS,
  });
}

// ── Main handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    const youtubeKey = Deno.env.get("YOUTUBE_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (path.endsWith("/transcribe")) {
      return await handleTranscribeRequest(req, youtubeKey, geminiKey);
    }

    if (path.endsWith("/summary")) {
      return await handleSummaryRequest(req, youtubeKey, geminiKey);
    }

    return await handleSearchRequest(req, youtubeKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return errorResponse(message, 500);
  }
});
