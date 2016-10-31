FROM mhart/alpine-node

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

RUN mkdir -p /app
WORKDIR /app

COPY package.json /app/
RUN npm install

# Bundle app source
COPY . /app

VOLUME /app/uploads
VOLUME /app/config.js

CMD ["npm", "run-script", "run"]