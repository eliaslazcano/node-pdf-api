FROM node:22.14.0
RUN mkdir -p /usr/src/app
COPY package.json /usr/src/app/

RUN apt-get update -yqq && apt-get install -yqq python3 build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev ghostscript libpng-dev libcurl4-openssl-dev mupdf-tools libfreetype6-dev qpdf pdftk && apt-get clean

WORKDIR /usr/src/app
RUN npm install
COPY . /usr/src/app
EXPOSE 3000

CMD ["node","--env-file=config.env","app.js"]