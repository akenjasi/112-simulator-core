import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from backend.api.router_telephony import start_call, StartCallRequest

@pytest.mark.asyncio
async def test_telephony_real_event_handling():
    """
    Test that the telephony router uses real events instead of asyncio.sleep 
    for transitioning from RINGING to ANSWERED.
    """
    req = StartCallRequest(ticket_id="123", operator_ext="1002")
    
    # Mock database session
    db_mock = AsyncMock()
    
    with patch("backend.api.router_telephony.telephony_adapter.originate_call", new_callable=AsyncMock) as mock_originate, \
         patch("backend.api.router_telephony.telephony_adapter.wait_for_answer", new_callable=AsyncMock) as mock_wait, \
         patch("backend.api.router_telephony.telephony_manager.broadcast_to_session", new_callable=AsyncMock), \
         patch("backend.api.router_telephony._update_db_session_call_status", new_callable=AsyncMock):
         
        mock_originate.return_value = "mock_call_id"
        mock_wait.return_value = True
        
        response = await start_call(req, db=db_mock)
        
        assert response.status == "ANSWERED"
        mock_wait.assert_awaited_once_with("1002", timeout=30.0)

