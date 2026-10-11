import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  FileText,
  Loader2,
  Play,
  AlertCircle,
  Sparkles,
  Clock,
  CheckCircle,
  Send,
  Upload,
  Mic,
  Type,
  Info,
} from "lucide-react";
import type { VideoResult, SummaryResult, SummaryStatus, FallbackTab, TranscriptSource } from "@/types";
import { fetchSummary, uploadAudioFile, transcribeAudio } from "@/lib/api";
import {
  formatSecondsToTimestamp,
  buildYoutubeTimestampUrl,
  formatDuration,
} from "@/lib/format";

const MAX_AUDIO_SIZE = 19 * 1024 * 1024; // 19 MB
const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
  "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a",
  "audio/flac", "audio/webm",
];

function sourceLabel(source: TranscriptSource): string {
  switch (source) {
    case "youtube_captions":
      return "YouTube captions";
    case "audio_transcription":
      return "AI audio transcription";
    case "user_provided":
      return "User-provided transcript";
  }
}

interface SummaryModalProps {
  video: VideoResult;
  topic: string;
  isOpen: boolean;
  onClose: () => void;
  cachedSummary: SummaryResult | null;
  onSummaryCached: (videoId: string, summary: SummaryResult) => void;
}

export function SummaryModal({
  video,
  topic,
  isOpen,
  onClose,
  cachedSummary,
  onSummaryCached,
}: SummaryModalProps) {
  const [status, setStatus] = useState<SummaryStatus>("idle");
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [error, setError] = useState("");
  const [fallbackTab, setFallbackTab] = useState<FallbackTab>("audio");
  const [userTranscript, setUserTranscript] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFileName, setAudioFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateSummary = useCallback(
    async (transcriptOverride?: string) => {
      setStatus("loading");
      setError("");

      try {
        const result = await fetchSummary({
          videoId: video.id,
          videoTitle: video.title,
          topic,
          transcript: transcriptOverride,
        });

        setSummary(result);
        onSummaryCached(video.id, result);

        if (!result.available) {
          setStatus("unavailable");
        } else {
          setStatus("success");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate summary.";
        setError(message);
        setStatus("error");
      }
    },
    [video.id, video.title, topic, onSummaryCached]
  );

  const handleAudioTranscribe = useCallback(async () => {
    if (!audioFile) return;

    setStatus("loading");
    setError("");

    try {
      const filePath = await uploadAudioFile(audioFile);

      const result = await transcribeAudio({
        filePath,
        videoId: video.id,
        videoTitle: video.title,
        topic,
      });

      setSummary(result);
      onSummaryCached(video.id, result);
      setAudioFile(null);
      setAudioFileName("");

      if (!result.available) {
        setStatus("unavailable");
      } else {
        setStatus("success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Audio transcription failed.";
      setError(message);
      setStatus("error");
    }
  }, [audioFile, video.id, video.title, topic, onSummaryCached]);

  // When modal opens, use cache or auto-generate
  useEffect(() => {
    if (!isOpen) return;

    if (cachedSummary) {
      setSummary(cachedSummary);
      if (cachedSummary.available) {
        setStatus("success");
      } else {
        setStatus("unavailable");
      }
    } else {
      setSummary(null);
      setStatus("loading");
      generateSummary();
    }
  }, [isOpen, cachedSummary, generateSummary]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAudioFile(null);
      setAudioFileName("");
      setUserTranscript("");
      setError("");
      setFallbackTab("audio");
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleFileSelect(file: File) {
    if (file.size > MAX_AUDIO_SIZE) {
      setError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 19 MB.`);
      setStatus("error");
      return;
    }
    setAudioFile(file);
    setAudioFileName(file.name);
    setError("");
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function handleTranscriptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (userTranscript.trim().length < 20) return;
    generateSummary(userTranscript.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 p-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <h2 className="text-sm font-bold text-ink-900">AI Summary</h2>
              {summary?.mode === "demo" && (
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-600">
                  Demo
                </span>
              )}
            </div>
            <p className="text-sm text-ink-700 line-clamp-1 font-medium">{video.title}</p>
            <p className="text-xs text-ink-500 mt-0.5">
              {video.channel}
              {video.duration && ` · ${formatDuration(video.duration)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {/* Loading state */}
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                  <FileText className="h-8 w-8 text-brand-600" />
                </div>
                <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-brand-600 bg-white rounded-full" />
              </div>
              <p className="text-sm font-medium text-ink-700">
                {audioFile
                  ? "Transcribing audio and generating summary..."
                  : "Fetching transcript and generating summary..."}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {audioFile
                  ? "Audio transcription may take 30-60 seconds"
                  : "This may take a few seconds"}
              </p>
            </div>
          )}

          {/* Success state */}
          {status === "success" && summary && (
            <div className="space-y-5 animate-fade-in">
              {/* Transcript source badge */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {sourceLabel(summary.transcriptSource)}
                </span>
              </div>

              {/* Summary text */}
              {summary.summary && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-brand-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                      Summary
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink-800">{summary.summary}</p>
                </div>
              )}

              {/* Important points with timestamps */}
              {summary.points.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-ink-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-700">
                      Important Points
                    </span>
                  </div>
                  <div className="space-y-2">
                    {summary.points.map((point, i) => {
                      const timestampUrl = buildYoutubeTimestampUrl(video.id, point.timestamp);
                      return (
                        <a
                          key={i}
                          href={timestampUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-3 transition-all hover:border-brand-300 hover:bg-brand-50/30 hover:shadow-sm"
                        >
                          <span className="flex flex-shrink-0 items-center gap-1 rounded-md bg-ink-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                            <Play className="h-2.5 w-2.5" fill="currentColor" />
                            {formatSecondsToTimestamp(point.timestamp)}
                          </span>
                          <p className="text-sm leading-relaxed text-ink-700 group-hover:text-ink-900">
                            {point.text}
                          </p>
                        </a>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-400">
                    Click any timestamp to open the video at that point on YouTube.
                  </p>
                </div>
              )}

              {/* Demo mode notice */}
              {summary.message && summary.mode === "demo" && (
                <div className="rounded-lg border border-accent-200 bg-accent-50 p-3">
                  <p className="text-xs text-accent-700">{summary.message}</p>
                </div>
              )}
            </div>
          )}

          {/* Unavailable state — offer audio upload or text paste */}
          {status === "unavailable" && (
            <div className="animate-fade-in">
              <div className="flex flex-col items-center text-center py-4">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-ink-100">
                  <AlertCircle className="h-7 w-7 text-ink-400" />
                </div>
                <h3 className="text-sm font-semibold text-ink-800">
                  No captions available
                </h3>
                <p className="mt-2 max-w-md text-sm text-ink-500">
                  {summary?.message ||
                    "This video has no public captions or transcript. You can upload an audio file or paste the transcript text to generate a summary."}
                </p>
              </div>

              {/* YouTube audio limitation note */}
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-brand-100 bg-brand-50/40 p-3">
                <Info className="h-4 w-4 flex-shrink-0 text-brand-600 mt-0.5" />
                <p className="text-xs leading-relaxed text-ink-600">
                  YouTube does not allow direct audio download from its videos outside of
                  its official API. If you have an audio recording of this video that you
                  have permission to process, upload it below and the AI will transcribe it
                  with timestamps, then generate the summary.
                </p>
              </div>

              {/* Fallback tabs */}
              <div className="mb-4 flex gap-2 rounded-xl bg-ink-100 p-1">
                <button
                  onClick={() => setFallbackTab("audio")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                    fallbackTab === "audio"
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-ink-500 hover:text-ink-700"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                  Upload Audio
                </button>
                <button
                  onClick={() => setFallbackTab("text")}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
                    fallbackTab === "text"
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-ink-500 hover:text-ink-700"
                  }`}
                >
                  <Type className="h-4 w-4" />
                  Paste Text
                </button>
              </div>

              {/* Audio upload tab */}
              {fallbackTab === "audio" && (
                <div className="space-y-3">
                  {!audioFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                        isDragging
                          ? "border-brand-500 bg-brand-50"
                          : "border-ink-300 hover:border-brand-400 hover:bg-ink-50"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_AUDIO_TYPES.join(",")}
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                      <div className="mb-3 flex justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                          <Upload className="h-6 w-6 text-brand-600" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-ink-700">
                        Click to select or drag &amp; drop an audio file
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        MP3, WAV, OGG, AAC, M4A, FLAC, or WebM · Max 19 MB
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100">
                          <Mic className="h-5 w-5 text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-800 truncate">
                            {audioFileName}
                          </p>
                          <p className="text-xs text-ink-500">
                            {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setAudioFile(null);
                            setAudioFileName("");
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-200 hover:text-ink-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleAudioTranscribe}
                      disabled={!audioFile}
                      className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Transcribe &amp; Summarize
                    </button>
                  </div>
                </div>
              )}

              {/* Text paste tab */}
              {fallbackTab === "text" && (
                <form onSubmit={handleTranscriptSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-ink-700">
                      Paste transcript text
                    </label>
                    <textarea
                      value={userTranscript}
                      onChange={(e) => setUserTranscript(e.target.value)}
                      placeholder="Paste the video transcript or captions here. Minimum 20 characters. No timestamps will be available with this option."
                      rows={6}
                      className="w-full rounded-xl border border-ink-300 p-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none scrollbar-thin"
                      autoFocus
                    />
                    {userTranscript.trim().length > 0 && userTranscript.trim().length < 20 && (
                      <p className="mt-1 text-xs text-warning-600">
                        Please enter at least 20 characters.
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-ink-400">
                      Note: Summaries from pasted text will show [00:00] timestamps since
                      exact timing is not available.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={userTranscript.trim().length < 20}
                      className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Generate Summary
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="flex flex-col items-center text-center py-12 animate-fade-in">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-error-50">
                <AlertCircle className="h-7 w-7 text-error-500" />
              </div>
              <h3 className="text-sm font-semibold text-ink-800">
                Could not generate summary
              </h3>
              <p className="mt-2 max-w-md text-sm text-ink-500">{error}</p>
              <button
                onClick={() => generateSummary()}
                className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700 active:scale-95"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 bg-ink-50/50">
          <span className="text-[11px] text-ink-400 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Powered by Gemini AI
          </span>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Watch on YouTube
            <Play className="h-3 w-3" fill="currentColor" />
          </a>
        </div>
      </div>
    </div>
  );
}
