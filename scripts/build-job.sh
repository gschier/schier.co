#!/bin/bash

FILE_PATH=$1

cat "${FILE_PATH}" | \
  sed "s|__CSRF_KEY__|${CSRF_KEY}|g" | \
  sed "s|__DATABASE_URL__|${DATABASE_URL}|g" | \
  sed "s|__DO_REGISTRY_TOKEN__|${DO_REGISTRY_TOKEN}|g" | \
  sed "s|__DO_SPACES_KEY__|${DO_SPACES_KEY}|g" | \
  sed "s|__DO_SPACES_SECRET__|${DO_SPACES_SECRET}|g" | \
  sed "s|__MAILJET_PRV_KEY__|${MAILJET_PRV_KEY}|g" | \
  sed "s|__MAILJET_PUB_KEY__|${MAILJET_PUB_KEY}|g" | \
  sed "s|__GITHUB_REF__|${GITHUB_REF}|g"
