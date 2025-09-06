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

python predict.py --image-file "../2.jpg" --prompt "Describe in detail what clothing items you see in this image. What type, color, style and material?"
`torch_dtype` is deprecated! Use `dtype` instead!
The image shows a woman wearing a white tank top, a long, dark brown cardigan, and light blue jeans. She is also wearing black sandals and sunglasses. The jeans are a classic fit with a slight flare at the bottom. The overall outfit appears casual and comfortable, suitable for a relaxed day out. The colors are neutral, with the white tank top and light blue jeans providing a soft contrast to the dark brown cardigan. The black sandals add a touch of sophistication to the casual ensemble.


cd fastvlm-server; python server.py;