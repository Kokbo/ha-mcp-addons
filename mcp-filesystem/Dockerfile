FROM node:20-alpine

RUN apk add --no-cache jq

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY run.sh /
RUN chmod +x /run.sh

CMD ["/run.sh"]
