import os
from dotenv import load_dotenv
from groq import Groq
from elevenlabs import ElevenLabs
from gtts import gTTS
import io
import re


load_dotenv()


def _strip_markdown_for_speech(text: str) -> str:
    """TTS reads raw characters literally, so strip markdown symbols before speaking."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)   # **bold** -> bold
    text = re.sub(r"\*(.+?)\*", r"\1", text)        # *italic* -> italic
    text = re.sub(r"__(.+?)__", r"\1", text)        # __bold__ -> bold
    text = re.sub(r"_(.+?)_", r"\1", text)          # _italic_ -> italic
    text = re.sub(r"`(.+?)`", r"\1", text)          # `code` -> code
    text = re.sub(r"#+\s*", "", text)               # ## Heading -> Heading
    text = re.sub(r"^\s*[-*•]\s+", "", text, flags=re.MULTILINE)  # bullet markers
    text = re.sub(r"\[(\d+)\]", "", text)           # citation markers like [1]
    return text.strip()

def transcribe_audio(audio_bytes: bytes, filename: str = "voice.webm") -> str:
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")

    client = Groq(api_key=api_key)

    transcription = client.audio.transcriptions.create(
        file=(filename, audio_bytes), 
        model="whisper-large-v3-turbo",
        response_format="text",
        language="en",  
    )

    return transcription.strip()


def synthesize_speech(text: str) -> bytes:
    clean_text = _strip_markdown_for_speech(text)
    if not clean_text:
        raise RuntimeError("No text to speak.")

    tts = gTTS(text=clean_text, lang="en")
    buffer = io.BytesIO()
    tts.write_to_fp(buffer)
    return buffer.getvalue()