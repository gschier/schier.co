# Frontend Build
FROM node:12-alpine AS frontend
ADD . ./app
WORKDIR /app/frontend
RUN npm install && npm run build

# Backend Build
FROM golang:1.14-alpine AS backend
WORKDIR /app
ADD . .
RUN apk add --no-cache git && go get github.com/markbates/pkger/cmd/pkger
COPY --from=frontend /app/frontend/static ./frontend/static
RUN pkger list && pkger  && go install ./...

# Production Image
FROM alpine:3.11
COPY --from=backend /go/bin/web ./web
CMD ["./web"]
