import os
import json
import logging
from typing import Optional
from httpx import AsyncClient

logger = logging.getLogger(__name__)

class SpoGateway:
    def __init__(self):
        self.protocol = os.getenv("SPO112_PROTOCOL", "REST").upper()
        self.endpoint = os.getenv("SPO112_ENDPOINT", "http://localhost:8080/api/export")
        self.username = os.getenv("SPO112_USERNAME", "admin")
        self.password = os.getenv("SPO112_PASSWORD", "secret")

    async def export_card(self, card_data: dict) -> bool:
        try:
            if self.protocol == "SOAP":
                return await self._export_soap(card_data)
            else:
                return await self._export_rest(card_data)
        except Exception as e:
            logger.error(f"Failed to export card to SPO-112 ({self.protocol}): {e}")
            return False

    async def _export_rest(self, card_data: dict) -> bool:
        async with AsyncClient(timeout=5.0) as client:
            response = await client.post(
                self.endpoint,
                json=card_data,
                auth=(self.username, self.password)
            )
            response.raise_for_status()
            logger.info(f"Successfully exported card via REST to {self.endpoint}")
            return True

    async def _export_soap(self, card_data: dict) -> bool:
        # A concrete WSDL operation/mapping has not been implemented.
        logger.warning("SOAP export is unavailable until a concrete service contract is configured")
        return False

spo_gateway = SpoGateway()
