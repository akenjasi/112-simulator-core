import re

with open("DOCKER.md", "r") as f:
    content = f.read()

security_section = """## Безопасность и ФЗ-152

В рамках защиты персональных данных (ПДн) и соответствия требованиям ФЗ-152:
- Пароли пользователей хешируются и хранятся в БД с использованием bcrypt.
- В качестве СУБД по умолчанию в Docker Compose используется PostgreSQL.
- Для обеспечения защиты данных в состоянии покоя (data-at-rest), администратору сервера рекомендуется включить шифрование диска на уровне хоста (например, LUKS / dm-crypt для раздела, куда смонтирован `postgres_data`) или использовать встроенные механизмы шифрования PostgreSQL (Postgres TDE - Transparent Data Encryption).

---

## Команды управления"""

content = content.replace("## Команды управления", security_section)

with open("DOCKER.md", "w") as f:
    f.write(content)

