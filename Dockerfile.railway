FROM node:22-alpine

WORKDIR /app

COPY services/whatsapp-web-bridge/package.json ./
RUN npm install --omit=dev

COPY services/whatsapp-web-bridge/src ./src

RUN mkdir -p /data/auth

ENV NODE_ENV=production
ENV PORT=3000
ENV WA_AUTH_DIR=/data/auth

EXPOSE 3000

CMD ["npm", "start"]
