
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from huggingface_hub import InferenceClient
from pydantic import BaseModel


# Load environment variables from python-backend/.env
load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(title="AI YouTube Learning Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Gemini client
API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None

# Hugging Face client for audio transcription
HF_TOKEN = os.getenv("HF_TOKEN")
whisper_client = (
    InferenceClient(provider="hf-inference", api_key=HF_TOKEN)
    if HF_TOKEN
    else None
)


class SummaryRequest(BaseModel):
    url: str
    transcript: str


class YouTubeURLRequest(BaseModel):
    url: str


def validate_youtube_url(url: str) -> bool:
    pattern = (
        r"^(https?://)?(www\.)?"
        r"(youtube\.com|youtu\.be)/.+$"
    )
    return re.match(pattern, url.strip()) is not None


def build_detailed_summary_prompt(video_title: str = "") -> str:
    """Create detailed instructions for an educational video summary."""

    title_context = (
        f"\nVideo title: {video_title}\n"
        if video_title
        else ""
    )

    return f"""
You are an expert teacher, educational video analyst,
and study-note creator.

{title_context}

Your goal is to help a college student understand the video deeply,
not merely provide a short summary.

Analyze the actual video content and create comprehensive,
well-organized study notes.

Use this structure:

# 1. Video Overview
- Explain the main purpose of the video.
- Describe what the student will learn.
- List the main learning objectives.

# 2. Detailed Summary
- Explain the video in a logical sequence.
- Cover the major topics and subtopics.
- Explain why each concept matters.
- Avoid overly short or vague bullet points.

# 3. Topic-by-Topic Explanation
For every major concept:
- Define it in simple English.
- Explain how it works step by step.
- Explain important terminology.
- Include important details discussed in the video.
- Explain relationships between concepts.

# 4. Examples and Applications
- Include examples provided by the instructor.
- Explain how each example works.
- Include practical applications when relevant.
- Clearly distinguish additional illustrative examples
  from examples actually shown in the video.

# 5. Important Definitions and Facts
- List important definitions, formulas, methods, rules,
  and facts discussed in the video.
- Explain each one briefly.

# 6. Common Confusions
- Clarify difficult or easily confused concepts.
- Do not claim a clarification was explicitly discussed
  if it is additional background information.

# 7. Key Takeaways
- Provide 8 to 12 meaningful takeaways.
- Focus on the most important things to remember.

# 8. Quick Revision Notes
- Provide concise, exam-friendly notes.
- Highlight important keywords.
- Include formulas or step sequences when applicable.

# 9. Practice Questions
Create:
- 5 short-answer questions with answers.
- 5 multiple-choice questions, each with four options.
- Clearly identify the correct option and explain why.
- Base questions on the video content.

# 10. Glossary
List important technical terms and explain them simply.

QUALITY RULES:
- Explain concepts as if teaching a student for the first time.
- Prefer detailed explanations over a short summary.
- Use clear headings, numbered steps, and readable bullet points.
- Preserve the video's actual meaning and important details.
- Do not invent quotations, statistics, formulas, or facts.
- Do not invent timestamps.
- If some video content cannot be accessed or understood,
  clearly disclose that limitation.
- If timestamps are unavailable, do not fabricate them.
- Keep the explanation focused on the actual video.
- Use clear, simple English suitable for college students.
"""


def format_timestamp(seconds: float) -> str:
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


@app.get("/")
def home():
    return {
        "status": "success",
        "message": "AI Learning Assistant backend is running",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "fastapi": "ready",
        "gemini_sdk": "ready" if client else "missing API key",
        "transcription": (
            "configured" if whisper_client else "missing HF_TOKEN"
        ),
    }


# Audio transcription endpoint
@app.post("/api/transcribe")
def transcribe_audio(file: UploadFile = File(...)):
    if whisper_client is None:
        raise HTTPException(
            status_code=500,
            detail="HF_TOKEN is missing in python-backend/.env.",
        )

    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid audio file.",
        )

    try:
        audio_data = file.file.read()

        if not audio_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded audio file is empty.",
            )

        result = whisper_client.automatic_speech_recognition(
            audio=audio_data,
            model="openai/whisper-large-v3",
        )

        transcript = result.text.strip()

        if not transcript:
            raise HTTPException(
                status_code=502,
                detail="No speech was detected in the audio.",
            )

        return {
            "status": "success",
            "filename": file.filename,
            "transcript": transcript,
        }

    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)

        if "402" in message or "Payment Required" in message:
            detail = (
                "Hugging Face inference credits are exhausted or "
                "payment is required."
            )
        elif "401" in message or "403" in message:
            detail = (
                "Hugging Face authentication failed. Check HF_TOKEN "
                "and its permissions."
            )
        else:
            detail = f"Transcription failed: {message}"

        raise HTTPException(
            status_code=502,
            detail=detail,
        ) from exc
    finally:
        file.file.close()


# Summarize a YouTube video directly from its URL
@app.post("/api/summarize-url")
def summarize_youtube_url(request: YouTubeURLRequest):
    url = request.url.strip()

    if not validate_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid YouTube URL.",
        )

    if client is None:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is missing in python-backend/.env.",
        )

    try:
        prompt = build_detailed_summary_prompt()

        interaction = client.interactions.create(
            model="gemini-3.8-flash",
            input=[
                {
                    "type": "text",
                    "text": prompt,
                },
                {
                    "type": "video",
                    "uri": url,
                },
            ],
        )

        summary = interaction.output_text

        if not summary:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty summary.",
            )

        return {
            "status": "success",
            "url": url,
            "summary": summary,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "YouTube summarization failed. Check whether your "
                "Gemini SDK supports video URL input and whether the "
                f"video is accessible. Details: {str(exc)}"
            ),
        ) from exc


# Summarize a transcript supplied by the caller
@app.post("/api/summarize")
def summarize_video(request: SummaryRequest):
    if not validate_youtube_url(request.url):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid YouTube URL.",
        )

    transcript = request.transcript.strip()

    if not transcript:
        raise HTTPException(
            status_code=400,
            detail="Transcript is required.",
        )

    if client is None:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is missing in python-backend/.env.",
        )

    prompt = f"""
{build_detailed_summary_prompt()}

IMPORTANT:
Use ONLY the transcript below as evidence about what the video
actually says. Do not pretend you watched the video directly.
Do not invent timestamps because this transcript has no timestamps.

Video URL: {request.url}

TRANSCRIPT:
{transcript}
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
        )

        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty summary.",
            )

        return {
            "status": "success",
            "url": request.url,
            "summary": response.text,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini summarization failed: {str(exc)}",
        ) from exc
