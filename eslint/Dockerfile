FROM node:alpine
RUN mkdir /app
WORKDIR /app

RUN npm install -g \
    eslint@^8.0.1 \
    eslint-config-standard \
    eslint-plugin-import@^2.25.2 \
    eslint-plugin-n@^16.0.0 \
    eslint-plugin-promise@^6.0.0

RUN npm init -y
RUN npm install --save-dev eslint-config-standard eslint-plugin-promise eslint-plugin-import eslint-plugin-n
ENTRYPOINT ["eslint"]
