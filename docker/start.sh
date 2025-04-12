#!/bin/bash

# Проверяем наличие сертификатов, если их нет - генерируем
if [ ! -f ./nginx/certs/cert.pem ] || [ ! -f ./nginx/certs/key.pem ]; then
    echo "Сертификаты не найдены. Генерирую самоподписанные сертификаты..."
    bash ./generate-certs.sh
fi

# Запускаем Docker Compose
echo "Запускаю приложение Toolgramm на https://flappy.keenetic.link"
docker-compose -f docker-compose.yml up -d

echo "Приложение запущено!"
echo "- Веб-интерфейс: https://flappy.keenetic.link"
echo "- API: https://flappy.keenetic.link/api" 