# ~~~~~~~~~~~~~~ #
# Frontend Build #
# ~~~~~~~~~~~~~~ #

FROM node:12-alpine as frontend

ADD . ./app

WORKDIR /app/frontend

RUN npm install && npm run build

# ~~~~~~~~~~~~~ #
# Backend Build #
# ~~~~~~~~~~~~~ #

FROM golang:1.14-alpine as backend

WORKDIR /app
ADD . .

COPY --from=frontend /app/frontend/static ./frontend/static
RUN go install ./... \
    && go get github.com/markbates/pkger/cmd/pkger \
    && pkger

# ~~~~~~~~~~~~~~~~ #
# Production Image #
# ~~~~~~~~~~~~~~~~ #

FROM alpine:3.11

WORKDIR /app

COPY --from=backend /go/bin/web ./web
COPY --from=backend /go/bin/manage ./manage

CMD ["./web"]
