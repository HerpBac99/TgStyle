docker-compose down; docker-compose up --build   
npm run build; npm run start; 
docker-compose -f docker-compose.db.yml up -d - только базу

Чтобы посмотреть статус контейнеров:

docker-compose -f docker-compose.db.yml ps
Чтобы посмотреть логи:

docker-compose -f docker-compose.db.yml logs -f
Чтобы остановить:

docker-compose -f docker-compose.db.yml down


netstat -aon | findstr :8080

nvidia-smi - видео память 

taskkill /F /IM node.exe


## Миграция БД (БЕЗ удаления данных)
```bash
cd db
npx prisma migrate dev --name описание_изменений --create-only
npx prisma migrate deploy
npx prisma generate
```
