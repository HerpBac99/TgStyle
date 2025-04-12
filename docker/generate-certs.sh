#!/bin/bash

# Создаем директорию для сертификатов, если она не существует
mkdir -p ./nginx/certs

# Устанавливаем имя домена из переменной окружения или используем значение по умолчанию
DOMAIN=${DOMAIN:-flappy.keenetic.link}

# Генерируем приватный ключ
openssl genrsa -out ./nginx/certs/key.pem 2048

# Генерируем запрос на подпись сертификата (CSR)
openssl req -new -key ./nginx/certs/key.pem -out ./nginx/certs/csr.pem -subj "/CN=${DOMAIN}/O=TelegramStyle/C=RU"

# Генерируем самоподписанный сертификат
openssl x509 -req -days 365 -in ./nginx/certs/csr.pem -signkey ./nginx/certs/key.pem -out ./nginx/certs/cert.pem

# Удаляем временный CSR-файл
rm ./nginx/certs/csr.pem

echo "Сертификаты успешно сгенерированы для домена ${DOMAIN}"
echo "Путь к сертификатам: ./nginx/certs/"
echo "  - Сертификат: cert.pem"
echo "  - Приватный ключ: key.pem" 