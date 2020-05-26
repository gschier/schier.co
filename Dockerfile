# ~~~~~~~~~~~~~~ #
# Frontend Build #
# ~~~~~~~~~~~~~~ #

FROM node:12-alpine as frontend

# Add the project
WORKDIR /app
ADD ./frontend ./

# Run tests and build
RUN npm install && npm run frontend:build

# ~~~~~~~~~~~~~ #
# Backend Build #
# ~~~~~~~~~~~~~ #

FROM golang:1.14-alpine as backend

# Add the project
WORKDIR /app
ADD ./backend ./

# Run tests and build
RUN go install ./...

# ~~~~~~~~~~~~~~~~ #
# Production Image #
# ~~~~~~~~~~~~~~~~ #

FROM alpine:3.11

WORKDIR /app

# Move necessary things to prod image
COPY --from=frontend /app/static ./static
COPY --from=backend /go/bin/web ./web
COPY --from=backend /go/bin/manage ./manage
COPY --from=backend /app/templates ./templates

CMD ["./web"]
