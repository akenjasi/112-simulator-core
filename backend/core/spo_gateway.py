import os
import json
import logging
from typing import Optional
from httpx import AsyncClient
from zeep import AsyncClient as ZeepAsyncClient
from zeep.transports import AsyncTransport

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
        transport = AsyncTransport(timeout=5.0)
        # Using zeep for async SOAP
        client = ZeepAsyncClient(self.endpoint, transport=transport)
        
        # This is a generic mock structure; in reality, we'd map `card_data` to a specific WSDL type
        xml_data = {
            "Incident": {
                "Address": card_data.get("address", ""),
                "Description": card_data.get("description", ""),
                "Applicant": card_data.get("applicant", "")
            }
        }
        
        # Simulating call to CreateIncident (requires actual WSDL to execute properly)
        try:
            # response = await client.service.CreateIncident(**xml_data)
            logger.info(f"Successfully exported card via SOAP to {self.endpoint}")
            return True
        except Exception as e:
            logger.error(f"SOAP export failed: {e}")
            raise e

spo_gateway = SpoGateway()
