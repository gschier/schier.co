# First stage for building the app
FROM golang:1.14-alpine as builder

RUN apk add \
      make \
      gcc \
      musl-dev

# Add the project
WORKDIR /app
ADD ./backend ./

# Run tests and build
RUN go install ./...

# Third stage with only the things needed for the app to run
FROM alpine:3.11

WORKDIR /app

# Move app binary to WORKDIR
COPY --from=builder /go/bin/web ./web
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

COPY --from=builder /app/dumps ./dumps

CMD ["./web"]
