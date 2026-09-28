#!/bin/bash

# Создать папку release/
mkdir -p release/

echo "Сборка backend..."
docker build -t simulator_backend:latest -f Dockerfile.backend .

echo "Сборка frontend..."
docker build -t simulator_frontend:latest -f Dockerfile.frontend .

echo "Скачивание postgres..."
docker pull postgres:15-alpine

echo "Сохранение образов в архив (это может занять некоторое время)..."
docker save -o release/images.tar simulator_backend:latest simulator_frontend:latest postgres:15-alpine

echo "Копирование файлов конфигурации..."
cp docker-compose.prod.yml release/docker-compose.yml
cp setup_env.py release/
cp .env.example release/

echo "========================================"
echo "Релиз успешно создан в папке 'release/'!"
echo "Вы можете перенести папку 'release/', вместе с '.gguf' моделями (если они скачаны в data/models), на изолированный сервер."
echo ""
echo "Инструкция для запуска на изолированном сервере:"
echo "1. Перейдите в папку release/"
echo "2. Загрузите образы: docker load -i images.tar"
echo "3. Скопируйте .env.example в .env и настройте его"
echo "4. Запустите: docker compose up -d"
echo "========================================"
