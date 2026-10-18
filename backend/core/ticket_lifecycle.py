"""Shared approval checks for tickets that can enter the DDS workflow."""


def is_approved_dds_ticket(ticket) -> bool:
    """Return whether a scenario has explicit teacher approval.

    Legacy and missing workflow states intentionally remain unapproved until a
    teacher confirms them through the approval endpoint.
    """
    workflow_state = getattr(ticket, "workflow_state", None) or {}
    return workflow_state.get("status") == "APPROVED"
