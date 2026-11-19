# SKIPPIES server image. No npm install needed (zero dependencies).
FROM node:24-slim
ENV NODE_ENV=production PORT=8080 DB_FILE=/data/skippies.db
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server
RUN mkdir -p /data && chown -R node:node /data /app/public/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.js"]
