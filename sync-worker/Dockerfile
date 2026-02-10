FROM node:20-alpine

RUN apk add --no-cache openssh-client expect

WORKDIR /app

COPY package.json ./
RUN npm install

COPY worker.js ./worker.js

CMD ["npm", "start"]
