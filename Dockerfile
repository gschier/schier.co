# Frontend Build
FROM node:12-alpine AS frontend
ADD . ./app
WORKDIR /app/frontend
RUN npm install && npm run build

# Backend Build
FROM golang:1.22-alpine AS backend
WORKDIR /app
ADD . .
COPY --from=frontend /app/frontend/static ./frontend/static
RUN go install ./...

# Production Image
FROM alpine:3.11
COPY --from=backend /go/bin/web ./web
CMD ["./web"]
