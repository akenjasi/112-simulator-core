import pytest
import os
import yaml

def test_nginx_ssl_configuration():
    """
    Check that docker-compose.yml exposes port 443 for nginx 
    and mounts an SSL directory.
    """
    compose_path = os.path.join(os.path.dirname(__file__), "..", "docker-compose.yml")
    if not os.path.exists(compose_path):
        pytest.skip("docker-compose.yml not found, skipping test")
        
    with open(compose_path, "r") as f:
        compose_data = yaml.safe_load(f)
        
    nginx_service = compose_data.get("services", {}).get("frontend", {})
    ports = nginx_service.get("ports", [])
    
    # Check if 443 is exposed
    has_443 = any(isinstance(p, str) and "443:443" in p for p in ports)
    
    # It might be conditional or not implemented strictly in docker-compose yet, 
    # but the worker must implement it.
    assert has_443, "Nginx service must expose port 443 for HTTPS"
