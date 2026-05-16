FROM node:20-alpine

RUN apk add --no-cache git openssh-client

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY run.sh /
RUN chmod +x /run.sh

CMD ["/run.sh"]
