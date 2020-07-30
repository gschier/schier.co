# ~~~~~~~~~~~~~~ #
# Frontend Build #
# ~~~~~~~~~~~~~~ #

FROM node:12-alpine as frontend

WORKDIR /app
ADD ./frontend ./

RUN npm install && npm run build

# ~~~~~~~~~~~~~ #
# Backend Build #
# ~~~~~~~~~~~~~ #

FROM golang:1.14-alpine as backend

WORKDIR /app
ADD . .

RUN go install ./...

# ~~~~~~~~~~~~~~~~ #
# Production Image #
# ~~~~~~~~~~~~~~~~ #

FROM alpine:3.11

WORKDIR /app

COPY --from=frontend /app/static ./static
COPY --from=backend /go/bin/web ./web
COPY --from=backend /go/bin/manage ./manage
COPY --from=backend /app/templates ./templates

CMD ["./web"]
