"""ASR Router for GigaAM-v3 speech recognition (HTTP & WebSocket streaming)."""

import os
import sys
import json
import uuid
import tempfile
import asyncio
import queue
import time
import datetime
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

    def __init__(self, model_path: Optional[str] = None, pool_size: int = 6):
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.model_path = model_path or os.getenv(
            "GIGAAM_MODEL_PATH",
            os.path.join(project_root, "models", "gigaam-v3-ctc-Q8_0.gguf"),
        )
        self.model = None
        self.session_pool = asyncio.Queue()
        self.pool_size = pool_size
        self.init_error = None
        self._init_model()

    def _init_model(self):
        try:
            import transcribe_cpp

            if os.path.exists(self.model_path):
                self.model = transcribe_cpp.Model(self.model_path)
                # Create a pool of sessions (lightweight inference contexts)
                for _ in range(self.pool_size):
                    self.session_pool.put_nowait(self.model.session())
                self.init_error = None
                logger.info(f"GigaAM v3 CTC model loaded from {self.model_path} with {self.pool_size} sessions")
            else:
                self.init_error = f"Model file not found: {self.model_path}"
                logger.warning(self.init_error)
        except Exception as e:
            self.init_error = f"{type(e).__name__}: {e}"
            logger.error(f"Failed to initialize transcribe_cpp: {e}", exc_info=True)

    def is_ready(self) -> bool:
        return self.model is not None

    async def transcribe_pcm(self, pcm: np.ndarray) -> str:
        """Transcribes 16kHz mono float32 PCM numpy array."""
        if len(pcm) == 0:
            return ""

        if not self.is_ready():
            return await self._transcribe_cli_pcm(pcm)

        # Acquire a session from the pool
        session = await self.session_pool.get()
        try:
            def _infer():
                res = session.run(pcm)
                return res.text.strip()

            return await asyncio.to_thread(_infer)
        finally:
            self.session_pool.put_nowait(session)

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


from fastapi import Form

@router_asr.post("/transcribe")
async def transcribe_audio_file(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None)
):
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
            
        if session_id:
            records_dir = os.path.join(BACKEND_DIR, "..", "data", "records")
            os.makedirs(records_dir, exist_ok=True)
            audio_file_path = os.path.join(records_dir, f"{session_id}_fallback.webm")
            text_file_path = os.path.join(records_dir, f"{session_id}.txt")
            with open(audio_file_path, "wb") as af:
                af.write(content)

        # Convert to 16kHz mono PCM float32
        pcm = await asyncio.to_thread(convert_to_pcm16k, content)
        if len(pcm) == 0:
            raise HTTPException(status_code=400, detail="Could not decode audio file format.")

        text = await asr_service.transcribe_pcm(pcm)
        
        if session_id and text:
            with open(text_file_path, "a", encoding="utf-8") as tf:
                tf.write(f"[{datetime.datetime.now().isoformat()}] {text}\n")
                
        return {"text": text}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@router_asr.websocket("/stream/{session_id}")
async def websocket_asr_stream(websocket: WebSocket, session_id: str, ticket_id: Optional[str] = None):
    """
    Real-Time Streaming WebSocket endpoint: ws://<host>/api/v2/asr/stream/{session_id}?ticket_id=<id>
    Accepts continuous binary PCM/audio chunks from the client,
    updates transcription incrementally without re-loading the model,
    and returns live recognized text on the fly.
    """
    await websocket.accept()
    conn_id = str(uuid.uuid4())
    logger.info(f"ASR WebSocket client connected: {conn_id} for session {session_id}, ticket {ticket_id}")

    pcm_buffer = np.array([], dtype=np.float32)
    committed_text = ""
    last_transcript = ""
    last_transcribe_time = 0.0
    
    records_dir = os.path.join(BACKEND_DIR, "..", "data", "records")
    os.makedirs(records_dir, exist_ok=True)
    audio_file_path = os.path.join(records_dir, f"{session_id}.raw")
    text_file_path = os.path.join(records_dir, f"{session_id}.txt")
    
    # Load ticket scenario from DB to feed RuntimeRouter with correct bricks
    scenario: dict = {}
    if ticket_id:
        try:
            from backend.database import AsyncSessionLocal
            from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
            async with AsyncSessionLocal() as db:
                ticket = await db.get(GeneratedTicket, ticket_id)
                if ticket:
                    gt = ticket.ground_truth or {}
                    scenario = {
                        "ticket_id": ticket_id,
                        "situation": ticket.plot or "",
                        "address": f"{gt.get('street', '')} {gt.get('house', '')}".strip(),
                        "caller_name": gt.get("fio", "Заявитель"),
                        "caller_phone": gt.get("phone", "+7 (916) 000-00-00"),
                        "has_victims": bool(gt.get("injured") and str(gt.get("injured")).lower() not in ("нет", "no", "false", "")),
                        "panic_level": 80,
                        # Pass bricks directly if stored in ground_truth
                        "bricks": gt.get("bricks", []),
                    }
                else:
                    s_ticket = await db.get(ScenarioTicket, ticket_id)
                    if s_ticket:
                        gt = s_ticket.ground_truth or {}
                        ai = s_ticket.ai_content or {}
                        scenario = {
                            "ticket_id": ticket_id,
                            "situation": gt.get("situation") or ai.get("plot", ""),
                            "address": gt.get("address", ""),
                            "caller_name": gt.get("caller_name", "Заявитель"),
                            "caller_phone": gt.get("caller_phone", "+7 (916) 000-00-00"),
                            "has_victims": bool(gt.get("has_victims", False)),
                            "panic_level": gt.get("panic_level", 70),
                            "bricks": gt.get("bricks", []),
                        }
        except Exception as e:
            logger.warning(f"Could not load ticket {ticket_id} for ASR session: {e}")

    # Initialize dialogue router with ticket scenario
    from backend.core.runtime_router import RuntimeRouter
    # If bricks are embedded in scenario, inject them into bricks_data
    router = RuntimeRouter(session_id=session_id, scenario=scenario)
    if scenario.get("bricks"):
        router.bricks_data = {"bricks": scenario["bricks"]}
    
    # Send initial applicant phrase ONLY on first connect (not on reconnects)
    # Use a module-level set to track which sessions already got the greeting
    if not hasattr(websocket_asr_stream, "_greeted_sessions"):
        websocket_asr_stream._greeted_sessions = set()
    
    is_first_connect = session_id not in websocket_asr_stream._greeted_sessions
    if is_first_connect:
        websocket_asr_stream._greeted_sessions.add(session_id)
        initial_phrase = router.get_initial_phrase()
        await websocket.send_json({
            "type": "dialogue_response",
            "operator_text": "",
            "applicant_text": initial_phrase.get("text", "Алло! Помогите!"),
            "audio_id": initial_phrase.get("audio_id", "brk_greeting_resp_01"),
        })

    try:
        while True:
            message = await websocket.receive()
            msg_type = message.get("type")

            # Handle disconnect gracefully
            if msg_type == "websocket.disconnect":
                break

            raw_bytes = message.get("bytes")
            text_data = message.get("text")

            if raw_bytes:
                # Append raw bytes to audio log
                with open(audio_file_path, "ab") as af:
                    af.write(raw_bytes)

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

                    # --- Simple Energy-Based VAD (Voice Activity Detection) ---
                    # Set VAD to approx 0.8 seconds (between 0.5 and 1s)
                    if len(pcm_buffer) > int(1.5 * 16000):
                        tail_audio = pcm_buffer[-int(0.8 * 16000):]
                        energy = np.mean(np.abs(tail_audio))
                        if energy < 0.003:  # Threshold for silence
                            # Transcribe the tail immediately before committing
                            final_tail = await asr_service.transcribe_pcm(pcm_buffer)
                            committed_text = f"{committed_text} {final_tail}".strip()
                            pcm_buffer = np.array([], dtype=np.float32)
                            last_transcript = ""
                            last_transcribe_time = time.time()
                            
                            # Append to text log
                            with open(text_file_path, "a", encoding="utf-8") as tf:
                                tf.write(f"[{datetime.datetime.now().isoformat()}] {final_tail}\n")
                            
                            # Push the update right away
                            await websocket.send_json({
                                "type": "transcript",
                                "text": committed_text,
                                "is_final": True,
                                "duration": 0.0,
                            })
                            
                            # Process dialogue through classifier
                            cleaned_text = committed_text.strip(" .!?,-\n\r").lower()
                            hallucinations = ["субтитры", "редактор", "amara", "спасибо за просмотр"]
                            is_hallucination = any(h in cleaned_text for h in hallucinations)
                            
                            if len(cleaned_text) >= 3 and not is_hallucination:
                                dialogue_result = router.process_message(operator_message=committed_text)
                                await websocket.send_json({
                                    "type": "dialogue_response",
                                    "operator_text": committed_text,
                                    "applicant_text": dialogue_result.get("reply", ""),
                                    "audio_id": dialogue_result.get("audio_id", ""),
                                })
                            
                            committed_text = ""

                    # Bounded sliding window fallback (max 10s to prevent huge slowdowns)
                    max_window = 10 * 16000
                    if len(pcm_buffer) > max_window:
                        committed_text = f"{committed_text} {last_transcript}".strip()
                        pcm_buffer = pcm_buffer[-int(1 * 16000):]
                        last_transcript = ""

                    # Throttled Transcription
                    current_time = time.time()
                    if len(pcm_buffer) >= int(0.35 * 16000) and (current_time - last_transcribe_time >= 0.5):
                        current_text = await asr_service.transcribe_pcm(pcm_buffer)
                        last_transcript = current_text
                        last_transcribe_time = time.time()  # Set AFTER inference to guarantee idle time!
                        full_text = f"{committed_text} {current_text}".strip()

                        await websocket.send_json({
                            "type": "transcript",
                            "text": full_text,
                            "is_final": False,
                            "duration": round(len(pcm_buffer) / 16000, 2),
                        })

            elif text_data:
                try:
                    payload = json.loads(text_data)
                    msg_type_payload = payload.get("type")

                    if msg_type_payload == "reset":
                        pcm_buffer = np.array([], dtype=np.float32)
                        committed_text = ""
                        last_transcript = ""
                        await websocket.send_json({"type": "reset_ack"})

                    elif msg_type_payload == "finalize":
                        if len(pcm_buffer) >= int(0.2 * 16000):
                            final_run = await asr_service.transcribe_pcm(pcm_buffer)
                            full_text = f"{committed_text} {final_run}".strip()
                            with open(text_file_path, "a", encoding="utf-8") as tf:
                                tf.write(f"[{datetime.datetime.now().isoformat()}] {final_run}\n")
                        else:
                            full_text = committed_text

                        await websocket.send_json({
                            "type": "transcript",
                            "text": full_text,
                            "is_final": True,
                        })
                        
                        if full_text:
                            dialogue_result = router.process_message(operator_message=full_text)
                            await websocket.send_json({
                                "type": "dialogue_response",
                                "operator_text": full_text,
                                "applicant_text": dialogue_result.get("reply", ""),
                                "audio_id": dialogue_result.get("audio_id", ""),
                            })
                            
                        pcm_buffer = np.array([], dtype=np.float32)
                        committed_text = ""
                        last_transcript = ""

                    elif msg_type_payload == "text_input":
                        input_text = payload.get("text", "")
                        if input_text:
                            with open(text_file_path, "a", encoding="utf-8") as tf:
                                tf.write(f"[{datetime.datetime.now().isoformat()}] [TEXT_INPUT] {input_text}\n")
                                
                            dialogue_result = router.process_message(operator_message=input_text)
                            await websocket.send_json({
                                "type": "dialogue_response",
                                "operator_text": input_text,
                                "applicant_text": dialogue_result.get("reply", ""),
                                "audio_id": dialogue_result.get("audio_id", ""),
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
