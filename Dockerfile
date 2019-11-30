FROM golang:1.12-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh && \
    go get -u github.com/cespare/reflex

WORKDIR /app

COPY ./go.mod ./go.sum ./vendor ./

RUN go mod download

COPY . .
