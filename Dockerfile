# First stage for building the app
FROM golang:1.14-alpine as builder

RUN apk add \
      make \
      gcc \
      musl-dev

# Add the project
ADD ./backend /app
WORKDIR /app

# Run tests and build
RUN go install ./...

# Third stage with only the things needed for the app to run
FROM alpine:3.11

EXPOSE 8080

WORKDIR /app

# Move app binary to WORKDIR
COPY --from=builder /go/bin/ .

CMD ["./web"]
