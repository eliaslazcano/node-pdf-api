FROM node:20.11.1
RUN mkdir -p /usr/src/app
COPY package.json /usr/src/app/

WORKDIR /usr/src/app
RUN npm install
COPY . /usr/src/app
EXPOSE 3000

CMD ["npm","start"]