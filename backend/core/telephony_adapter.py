import os
import socket
import logging
import asyncio
from typing import Optional
from panoramisk import Manager

logger = logging.getLogger(__name__)

class TelephonyAdapter:
    def __init__(self):
        self.host = os.getenv("ASTERISK_HOST", "127.0.0.1")
        self.port = int(os.getenv("ASTERISK_PORT", "5038"))
        self.login = os.getenv("ASTERISK_LOGIN", "admin")
        self.password = os.getenv("ASTERISK_PASSWORD", "secret")
        self.enabled = os.getenv("ENABLE_ASTERISK", "auto").lower()
        
        self.manager: Optional[Manager] = None
        self.connected = False
        self._pending_answers = {}
        self._checked_reachability = False
        self._is_reachable = False

    def _probe_asterisk(self) -> bool:
        if self.enabled in ("false", "0", "no"):
            return False
        try:
            with socket.create_connection((self.host, self.port), timeout=0.3):
                return True
        except (OSError, socket.error):
            return False

    async def _on_newstate(self, manager, message):
        state = message.get('ChannelStateDesc')
        channel = message.get('Channel', '')
        if state == 'Up':
            for endpoint, future in list(self._pending_answers.items()):
                if channel.startswith(f"PJSIP/{endpoint}") or channel.startswith(f"SIP/{endpoint}"):
                    if not future.done():
                        future.set_result(True)

    async def wait_for_answer(self, endpoint: str, timeout: float = 30.0) -> bool:
        if not await self._ensure_connected():
            return False
            
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._pending_answers[endpoint] = fut
        try:
            await asyncio.wait_for(fut, timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False
        finally:
            self._pending_answers.pop(endpoint, None)

    async def connect(self):
        if not self._checked_reachability:
            self._is_reachable = self._probe_asterisk()
            self._checked_reachability = True
            if not self._is_reachable:
                logger.info(f"Asterisk AMI not reachable at {self.host}:{self.port}. Running telephony in standalone simulator mode.")
                return

        if not self._is_reachable:
            return

        try:
            if self.manager is None:
                self.manager = Manager(
                    host=self.host,
                    port=self.port,
                    username=self.login,
                    secret=self.password,
                    ping_delay=10
                )
                self.manager.register_event('Newstate', self._on_newstate)

            await asyncio.wait_for(self.manager.connect(), timeout=5.0)
            self.connected = True
            logger.info(f"Connected to Asterisk AMI at {self.host}:{self.port}")
        except Exception as e:
            self.connected = False
            logger.warning(f"Failed to connect to Asterisk AMI: {e}")

    async def _ensure_connected(self):
        if not self.connected:
            await self.connect()
        return self.connected

    async def originate_call(self, endpoint: str, extension: str, context: str = "emergency-112-inbound") -> Optional[str]:
        if not await self._ensure_connected():
            return None
            
        action = {
            'Action': 'Originate',
            'Channel': f"PJSIP/{endpoint}",
            'Exten': extension,
            'Context': context,
            'Priority': 1,
            'CallerID': '112-Simulator',
            'Async': 'true'
        }
        
        try:
            response = await asyncio.wait_for(self.manager.send_action(action), timeout=5.0)
            logger.info(f"Originate response: {response}")
            return "call_originated_ami_id_mock" # Panoramisk returns a response object we'd parse
        except Exception as e:
            logger.error(f"Error originating call: {e}")
            return None

    async def hangup_call(self, channel: str, reason: str = "") -> bool:
        if not await self._ensure_connected():
            return False
            
        action = {
            'Action': 'Hangup',
            'Channel': channel,
            'Cause': '16' # Normal clearing
        }
        
        try:
            response = await asyncio.wait_for(self.manager.send_action(action), timeout=5.0)
            logger.info(f"Hangup response: {response}")
            return True
        except Exception as e:
            logger.error(f"Error hanging up call: {e}")
            return False

    async def get_call_status(self, channel: str) -> Optional[str]:
        if not await self._ensure_connected():
            return None
            
        action = {
            'Action': 'CoreShowChannels'
        }
        
        try:
            # Simple check, returning 'Up', 'Ringing', 'Hungup'
            response = await asyncio.wait_for(self.manager.send_action(action), timeout=5.0)
            # Would parse response for channel state, defaulting to mock for now
            return "Up"
        except Exception as e:
            logger.error(f"Error getting call status: {e}")
            return None

    async def play_audio(self, channel: str, audio_file: str) -> bool:
        if not await self._ensure_connected():
            return False
            
        # Play audio via AMI uses AGI or Local channel magic or just Originate.
        # But this adapter represents the Asterisk interface.
        return True

telephony_adapter = TelephonyAdapter()
