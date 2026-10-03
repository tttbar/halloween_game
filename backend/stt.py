"""Speech-to-text using faster-whisper.

Loads the model lazily so the server can start even before the (large) model
is downloaded. If faster-whisper is not installed or the model can't load, the
transcriber degrades gracefully and callers fall back to tap-to-answer.
"""
from __future__ import annotations

import io
import logging
import os

log = logging.getLogger("ghost.stt")

# base.en is a good balance of speed/accuracy for kids on an RTX 3060.
# Override with WHISPER_MODEL=small.en for a bit more accuracy.
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base.en")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "float16")


class Transcriber:
    def __init__(self) -> None:
        self._model = None
        self._available = None  # unknown until first load attempt

    @property
    def available(self) -> bool:
        if self._available is None:
            self._try_load()
        return bool(self._available)

    def _try_load(self) -> None:
        try:
            from faster_whisper import WhisperModel

            log.info("Loading faster-whisper model '%s' on %s...", MODEL_NAME, DEVICE)
            try:
                self._model = WhisperModel(
                    MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE
                )
            except Exception as gpu_err:  # noqa: BLE001 - fall back to CPU
                log.warning("GPU load failed (%s); falling back to CPU int8.", gpu_err)
                self._model = WhisperModel(
                    MODEL_NAME, device="cpu", compute_type="int8"
                )
            self._available = True
            log.info("Whisper model ready.")
        except Exception as err:  # noqa: BLE001
            log.warning("faster-whisper unavailable (%s). STT disabled.", err)
            self._model = None
            self._available = False

    def transcribe_media(self, media_bytes: bytes) -> str:
        """Transcribe any ffmpeg-decodable audio (webm/opus, wav, mp3...).

        The browser's MediaRecorder produces webm/opus; faster-whisper decodes
        it via PyAV when handed a file-like object. Returns lowercase text, or
        '' on failure so callers can fall back to tap-to-answer.
        """
        if not self.available or self._model is None:
            return ""
        try:
            segments, _info = self._model.transcribe(
                io.BytesIO(media_bytes),
                language="en",
                beam_size=1,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 300},
            )
            text = " ".join(seg.text for seg in segments)
            return text.strip().lower()
        except Exception as err:  # noqa: BLE001
            log.exception("Transcription failed: %s", err)
            return ""


transcriber = Transcriber()
