"""ASR Router for GigaAM-v3 speech recognition (HTTP & WebSocket streaming)."""

import os
import sys
import json
import uuid
import tempfile
import asyncio
import subprocess
import logging
from typing import Optional

import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect

import ctypes
logger = logging.getLogger("asr_service")

# Ensure shared libraries are discoverable and preloaded with RTLD_GLOBAL
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
BIN_DIR = os.path.join(BACKEND_DIR, "bin")
LIB_PATH = os.path.join(BIN_DIR, "libtranscribe.so")

for lib_name in ["libggml-base.so", "libggml.so", "libggml-cpu.so", "libtranscribe.so"]:
    p = os.path.join(BIN_DIR, lib_name)
    if os.path.exists(p):
        try:
            ctypes.CDLL(p, mode=ctypes.RTLD_GLOBAL)
        except Exception as e:
            logger.warning(f"Could not preload {p}: {e}")

if os.path.exists(LIB_PATH) and "TRANSCRIBE_LIBRARY" not in os.environ:
    os.environ["TRANSCRIBE_LIBRARY"] = LIB_PATH

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def convert_to_pcm16k(input_data: bytes) -> np.ndarray:
    """Converts raw audio bytes (WebM, WAV, MP3, etc.) to 16kHz mono float32 PCM using ffmpeg."""
    if not input_data:
        return np.array([], dtype=np.float32)

    cmd = [
        "ffmpeg",
        "-nostdin",
        "-loglevel",
        "quiet",
        "-i",
        "pipe:0",
        "-f",
        "f32le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "pipe:1",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=input_data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        if proc.stdout:
            return np.frombuffer(proc.stdout, dtype=np.float32)
    except Exception as e:
        logger.warning(f"ffmpeg conversion failed: {e}")

    return np.array([], dtype=np.float32)


class ASRService:
    """Singleton service managing in-memory GigaAM-v3 CTC model session."""

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.getenv(
            "GIGAAM_MODEL_PATH",
            "/home/orborus/Desktop/A_vibecoding/models/gigaam-v3-ctc-Q8_0.gguf",
        )
        self.model = None
        self.session = None
        self.lock = asyncio.Lock()
        self.init_error = None
        self._init_model()

    def _init_model(self):
        try:
            import transcribe_cpp

            if os.path.exists(self.model_path):
                self.model = transcribe_cpp.Model(self.model_path)
                self.session = self.model.session()
                self.init_error = None
                logger.info(f"GigaAM v3 CTC model loaded from {self.model_path}")
            else:
                self.init_error = f"Model file not found: {self.model_path}"
                logger.warning(self.init_error)
        except Exception as e:
            self.init_error = f"{type(e).__name__}: {e}"
            logger.error(f"Failed to initialize transcribe_cpp: {e}", exc_info=True)

    def is_ready(self) -> bool:
        return self.session is not None

    async def transcribe_pcm(self, pcm: np.ndarray) -> str:
        """Transcribes 16kHz mono float32 PCM numpy array."""
        if len(pcm) == 0:
            return ""

        if not self.is_ready():
            return await self._transcribe_cli_pcm(pcm)

        async with self.lock:
            def _infer():
                res = self.session.run(pcm)
                return res.text.strip()

            return await asyncio.to_thread(_infer)

    async def _transcribe_cli_pcm(self, pcm: np.ndarray) -> str:
        """Fallback via transcribe-cli command line binary."""
        cli_path = os.path.join(BIN_DIR, "transcribe-cli")
        if not os.path.exists(cli_path):
            raise RuntimeError("transcribe-cli not found in backend/bin")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            import soundfile as sf
            sf.write(tmp_path, pcm, 16000, format="WAV", subtype="PCM_16")

            cmd = [cli_path, "-q", "-m", self.model_path, tmp_path]
            proc = await asyncio.to_thread(
                subprocess.run, cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            text = ""
            for line in proc.stdout.splitlines():
                if line.startswith("text:"):
                    text = line.split("text:", 1)[1].strip()
                    if text == "(empty)":
                        text = ""
                    break
            return text
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


# Global singleton instance
asr_service = ASRService()

router_asr = APIRouter(prefix="/api/v2/asr", tags=["ASR (Speech Recognition)"])


@router_asr.get("/status")
async def get_asr_status():
    """Returns ASR service readiness and loaded model info."""
    return {
        "status": "ready" if asr_service.is_ready() else "not_ready",
        "model": "gigaam-v3-ctc-Q8_0",
        "model_path": asr_service.model_path,
        "model_exists": os.path.exists(asr_service.model_path),
        "error": asr_service.init_error,
    }


@router_asr.post("/transcribe")
async def transcribe_audio_file(file: UploadFile = File(...)):
    """
    Receives an audio file (WebM, WAV, MP3, MP4, etc.),
    converts it to 16000 Hz Mono Float32 WAV/PCM and runs GigaAM-v3 inference.
    Returns: {"text": "распознанный текст"}
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as tmp_file:
        tmp_path = tmp_file.name

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file provided.")

        with open(tmp_path, "wb") as f:
            f.write(content)

        # Convert to 16kHz mono PCM float32
        pcm = await asyncio.to_thread(convert_to_pcm16k, content)
        if len(pcm) == 0:
            raise HTTPException(status_code=400, detail="Could not decode audio file format.")

        text = await asr_service.transcribe_pcm(pcm)
        return {"text": text}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router_asr.websocket("/stream")
async def websocket_asr_stream(websocket: WebSocket):
    """
    Real-Time Streaming WebSocket endpoint: ws://<host>/api/v2/asr/stream
    Accepts continuous binary PCM/audio chunks from the client,
    updates transcription incrementally without re-loading the model,
    and returns live recognized text on the fly.
    """
    await websocket.accept()
    conn_id = str(uuid.uuid4())
    logger.info(f"ASR WebSocket client connected: {conn_id}")

    pcm_buffer = np.array([], dtype=np.float32)
    committed_text = ""
    last_transcript = ""

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]

                # Check format of binary chunk
                if len(raw_bytes) >= 4 and raw_bytes[:4] in (b"RIFF", b"\x1a\x45\xdf\xa3", b"OggS"):
                    chunk_pcm = await asyncio.to_thread(convert_to_pcm16k, raw_bytes)
                elif len(raw_bytes) >= 4 and raw_bytes[:4] == b"PCM1":
                    # Tagged 16kHz Int16 PCM: "PCM1" header followed by 16-bit integer samples
                    chunk_pcm = np.frombuffer(raw_bytes[4:], dtype=np.int16).astype(np.float32) / 32768.0
                else:
                    # Raw Int16 16kHz PCM
                    chunk_pcm = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0

                if len(chunk_pcm) > 0:
                    pcm_buffer = np.concatenate([pcm_buffer, chunk_pcm]) if len(pcm_buffer) > 0 else chunk_pcm

                    # Bounded sliding window: GigaAM CTC supports up to 25s
                    # If exceeding 20s, commit text and keep last 3s as context
                    max_window = 20 * 16000
                    if len(pcm_buffer) > max_window:
                        committed_text = f"{committed_text} {last_transcript}".strip()
                        pcm_buffer = pcm_buffer[-int(3 * 16000):]

                    # Transcribe once we have at least 0.35s of audio
                    if len(pcm_buffer) >= int(0.35 * 16000):
                        current_text = await asr_service.transcribe_pcm(pcm_buffer)
                        last_transcript = current_text
                        full_text = f"{committed_text} {current_text}".strip()

                        await websocket.send_json({
                            "type": "transcript",
                            "text": full_text,
                            "is_final": False,
                            "duration": round(len(pcm_buffer) / 16000, 2),
                        })

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "reset":
                        pcm_buffer = np.array([], dtype=np.float32)
                        committed_text = ""
                        last_transcript = ""
                        await websocket.send_json({"type": "reset_ack"})

                    elif msg_type == "finalize":
                        if len(pcm_buffer) >= int(0.2 * 16000):
                            final_run = await asr_service.transcribe_pcm(pcm_buffer)
                            full_text = f"{committed_text} {final_run}".strip()
                        else:
                            full_text = committed_text

                        await websocket.send_json({
                            "type": "transcript",
                            "text": full_text,
                            "is_final": True,
                        })
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info(f"ASR WebSocket client disconnected: {conn_id}")
    except Exception as e:
        logger.error(f"ASR WebSocket exception: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
