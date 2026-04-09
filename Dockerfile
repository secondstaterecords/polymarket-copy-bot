FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV BULLPEN_PATH=/app/bullpen
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://cli.bullpen.fi/install.sh | INSTALL_DIR=/app sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
EXPOSE 3847 3848
CMD ["sh", "-c", "npx tsx bot.ts & npx tsx dashboard.ts"]
