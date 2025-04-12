param (
    [switch]$Rebuild,
    [switch]$Force
)

# Создаем .env файл если не существует
if (-not (Test-Path .\.env)) {
    Write-Host "Создаю файл .env..." -ForegroundColor Green
    Set-Content -Path .\.env -Value @"
DOMAIN=flappy.keenetic.link
APP_URL=https://flappy.keenetic.link
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
"@
    Write-Host "Внимание: Вам необходимо указать правильный TELEGRAM_BOT_TOKEN в файле .env" -ForegroundColor Yellow
}

# Проверяем наличие сертификатов
$sslDir = Join-Path -Path (Get-Item ..).FullName -ChildPath "ssl"
$certPath = Join-Path -Path $sslDir -ChildPath "cert.pem"
$keyPath = Join-Path -Path $sslDir -ChildPath "key.pem"

if (-not (Test-Path $certPath) -or -not (Test-Path $keyPath) -or $Force) {
    Write-Host "Создаю SSL-сертификаты..." -ForegroundColor Green
    
    # Создаем директорию ssl если не существует
    if (-not (Test-Path $sslDir)) {
        New-Item -Path $sslDir -ItemType Directory -Force | Out-Null
    }
    
    # Генерируем сертификаты с помощью Docker и Alpine
    docker run --rm --volume ${PWD}:/work --workdir /work alpine sh -c "
    apk add --no-cache openssl &&
    openssl genrsa -out /work/key.pem 2048 &&
    openssl req -new -key /work/key.pem -out /work/csr.pem -subj '/CN=flappy.keenetic.link/O=TelegramStyle/C=RU' &&
    openssl x509 -req -days 365 -in /work/csr.pem -signkey /work/key.pem -out /work/cert.pem &&
    rm /work/csr.pem"
    
    # Перемещаем сертификаты в директорию ssl
    Move-Item -Path .\cert.pem -Destination $certPath -Force
    Move-Item -Path .\key.pem -Destination $keyPath -Force
    
    Write-Host "SSL-сертификаты созданы и перемещены в $sslDir" -ForegroundColor Green
}

# Останавливаем контейнеры если они запущены
if (docker-compose ps --services | Where-Object { $_ }) {
    Write-Host "Останавливаю запущенные контейнеры..." -ForegroundColor Yellow
    docker-compose down
}

# Пересобираем образы если указан параметр -Rebuild
if ($Rebuild) {
    Write-Host "Пересобираю Docker-образы..." -ForegroundColor Yellow
    docker-compose build
}

# Запускаем контейнеры
Write-Host "Запускаю приложение на https://flappy.keenetic.link..." -ForegroundColor Green
docker-compose up -d

Write-Host "`nПриложение запущено!" -ForegroundColor Green
Write-Host "- Веб-интерфейс: https://flappy.keenetic.link" -ForegroundColor Cyan
Write-Host "- API: https://flappy.keenetic.link/api" -ForegroundColor Cyan
Write-Host "`nДля просмотра логов используйте:" -ForegroundColor White
Write-Host "docker-compose logs -f" -ForegroundColor Gray 