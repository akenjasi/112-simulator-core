import re

with open("README.md", "r") as f:
    content = f.read()

security_section = """## Безопасность и ФЗ-152

Проект поддерживает работу с PostgreSQL и включает архитектурные решения (в том числе хеширование паролей и инструкции по защите томов БД) для соответствия требованиям ФЗ-152 (защита ПДн). Подробности в [DOCKER.md](DOCKER.md).

## Быстрый старт (Docker)"""

content = content.replace("## Быстрый старт (Docker)", security_section)

with open("README.md", "w") as f:
    f.write(content)

