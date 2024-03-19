FROM node:20.11.1
RUN mkdir -p /usr/src/app
COPY package.json /usr/src/app/

RUN apt-get -yqq update
RUN apt-get -yqq install python3 build-essential ghostscript libjpeg-dev libpng-dev libcurl4-openssl-dev mupdf-tools libfreetype6-dev qpdf
RUN apt-get clean

WORKDIR /usr/src/app
RUN npm install
COPY . /usr/src/app
EXPOSE 3000

CMD ["npm","start"]