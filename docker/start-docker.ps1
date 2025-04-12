# Create .env file if not exists
if (-not (Test-Path .\.env)) {
    "DOMAIN=flappy.keenetic.link
APP_URL=https://flappy.keenetic.link
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN" | Out-File -FilePath .\.env -Encoding utf8
    Write-Host "Created .env file. Please set your Telegram Bot Token." -ForegroundColor Yellow
}

# Create SSL directory in root folder
$sslDir = Join-Path -Path (Get-Item ..).FullName -ChildPath "ssl"
if (-not (Test-Path $sslDir)) {
    New-Item -Path $sslDir -ItemType Directory -Force | Out-Null
    Write-Host "Created SSL directory: $sslDir" -ForegroundColor Green
}

# Check if SSL certificates exist
$certPath = Join-Path -Path $sslDir -ChildPath "cert.pem"
$keyPath = Join-Path -Path $sslDir -ChildPath "key.pem"

if (-not (Test-Path $certPath) -or -not (Test-Path $keyPath)) {
    Write-Host "Generating SSL certificates..." -ForegroundColor Green
    
    # Generate certificates using Docker and Alpine
    docker run --rm -v "${PWD}:/work" alpine sh -c "
    apk add --no-cache openssl &&
    openssl genrsa -out /work/key.pem 2048 &&
    openssl req -new -key /work/key.pem -out /work/csr.pem -subj '/CN=flappy.keenetic.link' &&
    openssl x509 -req -days 365 -in /work/csr.pem -signkey /work/key.pem -out /work/cert.pem &&
    rm /work/csr.pem"
    
    # Move certificates to SSL directory
    if (Test-Path .\cert.pem) {
        Move-Item -Path .\cert.pem -Destination $certPath -Force
        Move-Item -Path .\key.pem -Destination $keyPath -Force
        Write-Host "SSL certificates created and moved to $sslDir" -ForegroundColor Green
    } else {
        Write-Host "Failed to generate certificates. Please check Docker." -ForegroundColor Red
    }
}

# Build and start containers
Write-Host "Building and starting Docker containers..." -ForegroundColor Green
docker-compose build
docker-compose up -d

Write-Host "Application started!" -ForegroundColor Green
Write-Host "Web interface: https://flappy.keenetic.link" -ForegroundColor Cyan
Write-Host "API: https://flappy.keenetic.link/api" -ForegroundColor Cyan
Write-Host "To view logs, use: docker-compose logs -f" -ForegroundColor Gray 