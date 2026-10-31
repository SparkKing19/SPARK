FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && apt-get install -y curl ca-certificates bash \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

RUN mkdir -p /app/lavalink \
 && curl -fL --retry 5 \
    https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar \
    -o /app/lavalink/Lavalink.jar

COPY application.yml /app/lavalink/application.yml
COPY start.sh /app/start.sh
COPY src ./src
RUN chmod +x /app/start.sh

ENV NODE_ENV=production
CMD ["/app/start.sh"]
