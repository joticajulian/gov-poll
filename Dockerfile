FROM node:16.14.2
WORKDIR /contracts
ADD . ./
ARG CONTRACT
RUN yarn install --frozen-lockfile --silent && yarn cache clean
RUN yarn $CONTRACT:build
RUN yarn $CONTRACT:info