import os
import ldap3
import logging

logger = logging.getLogger(__name__)

def authenticate_ldap(username: str, password: str) -> bool:
    """
    Attempts to bind to the LDAP server with the given username and password.
    Returns True if successful, False otherwise.
    """
    ldap_enabled = os.getenv("LDAP_ENABLED", "False").lower() in ("true", "1", "yes")
    if not ldap_enabled:
        return False

    ldap_server = os.getenv("LDAP_SERVER")
    if not ldap_server:
        logger.warning("LDAP_ENABLED is True, but LDAP_SERVER is not set.")
        return False

    ldap_domain = os.getenv("LDAP_DOMAIN")
    ldap_base_dn = os.getenv("LDAP_BASE_DN")

    user_dn = username
    if ldap_domain:
        user_dn = f"{username}@{ldap_domain}"
    elif ldap_base_dn:
        user_dn = f"uid={username},{ldap_base_dn}"

    try:
        server = ldap3.Server(ldap_server, get_info=ldap3.ALL)
        conn = ldap3.Connection(server, user=user_dn, password=password, auto_bind=True)
        if conn.bind():
            conn.unbind()
            return True
        return False
    except ldap3.core.exceptions.LDAPException as e:
        logger.error(f"LDAP binding error for user {username}: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during LDAP bind for user {username}: {e}")
        return False
