docker-compose down; docker-compose up --build   
npm run build; npm run start; 
docker-compose up -d db - только базу
netstat -aon | findstr :8080

taskkill /F /IM node.exe



npx prisma migrate dev --name add_friends_field
npx prisma generate
npx prisma db push
npx prisma generate --schema=./dataBase/prisma/schema.prisma
npx prisma studio - просмотр бд
npx prisma db seed - заполнение базы 

ollama run llama3.1:8b   
