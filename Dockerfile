# Node 25 dipakai karena node:sqlite dan WebSocket sudah bawaan — proyek ini
# tidak punya satu pun dependensi npm, jadi tidak ada langkah install.
FROM node:25-alpine

RUN apk add --no-cache tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Jakarta /etc/localtime
ENV TZ=Asia/Jakarta NODE_ENV=production

WORKDIR /app
COPY package.json server.js ./
COPY src/ ./src/
COPY config/ ./config/
COPY public/ ./public/

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=8s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/kesehatan').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
