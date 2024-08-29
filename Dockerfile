FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install --frozen-lockfile

RUN npm i -g serve

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "build/index.js"]
# CMD [ "serve", "-s", "dist" ]n