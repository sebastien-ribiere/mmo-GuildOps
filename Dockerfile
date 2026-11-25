FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node","src/server.mjs"]
