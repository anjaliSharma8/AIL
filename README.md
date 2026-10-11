# AI YouTube Learning Assistant

Enter any topic or question — like "What is Deep Learning?" — and get relevant YouTube learning videos ranked by quality and engagement, complete with AI-generated summaries of video transcripts.

## Features

- **Topic search** — Enter any topic or question and get matching YouTube videos
- **Quality ranking** — Videos are scored on a configurable algorithm weighing:
  - Relevance (30%) — how well the title matches your query
  - Popularity (30%) — log-normalized view count
  - Engagement (25%) — like-to-view ratio
  - Freshness (15%) — newer videos score higher
- **On-demand AI summaries** — Click "Summary" on any video card to generate a timestamped summary for that specific video. Summaries are organized into important points with clickable timestamps that open the video at that exact moment on YouTube
- **3-tier transcript strategy** — The system tries multiple methods to obtain a transcript:
  1. **YouTube captions** — Public caption tracks embedded in the watch page
  2. **Audio upload + AI transcription** — Upload an audio file you have permission to process; Gemini transcribes it with timestamps
  3. **Text paste** — Manually paste transcript text (no timestamps available)
- **Summary caching** — Generated summaries are cached in-memory per session, so re-opening a video's summary is instant
- **Graceful degradation** — Missing transcripts, unavailable statistics, and unconfigured API keys are all handled cleanly
- **Demo mode** — When API keys are not configured, the app returns clearly-labeled mock results so the UI is fully functional for previewing
- **Responsive design** — Works from mobile to desktop with a modern, student-friendly aesthetic

## How it works

```
User query → Edge Function → YouTube Data API v3 (search + video details)
                              → Ranking engine scores each video
                              → Sorted results returned to frontend

User clicks Summary on a video card
             → Edge Function tries YouTube public caption tracks
             → If captions found: Gemini generates timestamped summary
             → If no captions: modal offers audio upload or text paste
               → Audio upload: stored in Supabase Storage, Gemini transcribes
                 with timestamps, then generates summary, file is deleted
               → Text paste: Gemini generates summary (no timestamps)
             → Modal displays summary with clickable timestamps
```

### Mode indicator

Every response includes a `mode` field:

| Mode | Meaning |
|------|---------|
| `demo` | YouTube API key not configured — showing mock data |
| `live` | Real YouTube Data API results |

The UI displays a "Demo" or "Live" badge so results are never confused.

## Setup

### Prerequisites

- Node.js 18+
- A Supabase project (already provisioned in this Bolt environment)

### Install dependencies

```bash
npm install
```

### Configure API keys

The app works in **demo mode** out of the box — no configuration required to see the UI.

To enable **live mode** with real YouTube data and AI summaries:

1. **YouTube Data API key**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the **YouTube Data API v3**
   - Create an API key under **Credentials**
   - Add it as a Supabase edge function secret named `YOUTUBE_API_KEY`

2. **Gemini API key** (optional — for AI summaries only)
   - Go to [Google AI Studio](https://aistudio.google.com/apikey)
   - Create an API key
   - Add it as a Supabase edge function secret named `GEMINI_API_KEY`

> API keys are stored as Supabase edge function secrets and are never exposed to the frontend. The `.env.example` file documents the required variables — do not commit actual keys to version control.

### Run the development server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

## Project structure

```
src/
├── components/
│   ├── SearchBar.tsx       # Search input with suggestions
│   ├── VideoCard.tsx       # Video result card with stats, ranking, summary button
│   ├── SummaryModal.tsx    # On-demand AI summary modal with clickable timestamps
│   ├── LoadingState.tsx    # Skeleton loading cards
│   └── States.tsx          # Empty, error, and demo banner states
├── lib/
│   ├── api.ts              # Edge function client
│   └── format.ts           # Number/date/duration formatting utilities
├── types.ts                # Shared TypeScript types
├── App.tsx                 # Main page layout
└── index.css               # Tailwind + custom styles

supabase/
├── config.toml             # Edge function configuration
└── functions/
    └── youtube-search/
        └── index.ts        # YouTube search + ranking + Gemini summaries
```

## Ranking algorithm

The ranking score (0–100) is computed as:

```
score = relevance × 0.30 + engagement × 0.25 + popularity × 0.30 + freshness × 0.15
```

| Factor | Calculation | Weight |
|--------|-------------|--------|
| Relevance | Fraction of query words found in title/channel | 30% |
| Engagement | `min(likeToViewRatio / 0.04, 1)` — 4% is excellent | 25% |
| Popularity | `log₁₀(views + 1) / log₁₀(10M + 1)` — log-scaled | 30% |
| Freshness | 1.0 if < 1yr, 0.8 if < 2yr, 0.6 if < 3yr, 0.4 if < 5yr, 0.2 otherwise | 15% |

Weights are configurable in the edge function (`RANKING_WEIGHTS` constant).

## Tech stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite, Lucide icons
- **Backend:** Supabase Edge Functions (Deno runtime)
- **APIs:** YouTube Data API v3, Google Gemini API
- **Fonts:** Inter (Google Fonts)

## Notes

- **Transcript strategy**: YouTube does not allow direct audio download from its videos outside of its official API. The system uses a 3-tier approach: (1) YouTube public caption tracks extracted from the watch page HTML, (2) user-uploaded audio files transcribed by Gemini's audio processing (supports MP3, WAV, OGG, AAC, M4A, FLAC, WebM up to 19 MB), and (3) user-pasted transcript text. Audio files are uploaded to a private Supabase Storage bucket, processed by the edge function, and immediately deleted after transcription.
- Some videos may have statistics disabled by the channel owner. In that case, views/likes/comments show as "N/A" and engagement is not factored into the ranking score.
- Demo mode uses Unsplash placeholder images instead of real YouTube thumbnails.
- Summaries are generated only when the user clicks "Summary" on a specific video — they are never auto-generated for all search results.
- Audio transcription via Gemini may take 30-60 seconds depending on file length. Timestamps are generated by Gemini based on the audio content and are approximate.
