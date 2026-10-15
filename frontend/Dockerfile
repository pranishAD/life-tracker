# Life Tracker frontend — dev image.
# Node LTS, Vite dev server (source is bind-mounted by docker-compose.yml
# so edits on the host hot-reload without a rebuild).

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
