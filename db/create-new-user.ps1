# PowerShell скрипт для создания нового пользователя PostgreSQL

Write-Host "Создание нового пользователя TgStyle_Admin..." -ForegroundColor Green

# Подключаемся к PostgreSQL как суперпользователь
Write-Host "Подключаемся к PostgreSQL как postgres..." -ForegroundColor Yellow

# Создаем нового пользователя
Write-Host "Создаем пользователя TgStyle_Admin..." -ForegroundColor Yellow
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "CREATE USER TgStyle_Admin WITH PASSWORD '@TgStyle_pass2025@!';"

# Даем права на базу данных
Write-Host "Даем права на базу данных..." -ForegroundColor Yellow
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "GRANT ALL PRIVILEGES ON DATABASE telegramstyle TO TgStyle_Admin;"
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "GRANT ALL PRIVILEGES ON SCHEMA public TO TgStyle_Admin;"
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO TgStyle_Admin;"
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO TgStyle_Admin;"
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "ALTER USER TgStyle_Admin CREATEDB;"

# Проверяем что пользователь создан
Write-Host "Проверяем нового пользователя..." -ForegroundColor Yellow
docker exec telegramstyle-postgres psql -U postgres -d telegramstyle -c "SELECT usename FROM pg_user WHERE usename = 'TgStyle_Admin';"

Write-Host "Пользователь TgStyle_Admin создан!" -ForegroundColor Green
Write-Host ""
Write-Host "Теперь обновите конфигурацию:" -ForegroundColor Cyan
Write-Host "1. database.env:" -ForegroundColor Cyan
Write-Host "   DATABASE_URL=postgresql://TgStyle_Admin:@TgStyle_pass2025@!@localhost:5432/telegramstyle?schema=public" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. docker-compose.db.yml:" -ForegroundColor Cyan
Write-Host "   POSTGRES_USER=TgStyle_Admin" -ForegroundColor Cyan
Write-Host "   POSTGRES_PASSWORD=@TgStyle_pass2025@!" -ForegroundColor Cyan
Write-Host ""
Write-Host "ВАЖНО: После смены пользователя нужно пересоздать все таблицы!" -ForegroundColor Red
Write-Host "   cd db && npm run db:push" -ForegroundColor Red
