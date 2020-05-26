#!/bin/bash

echo "Writing SSH key"
mkdir -p ~/.ssh && echo "${SSH_PRIVATE_KEY}" | tr -d '\r' > ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa

echo "Adding to known hosts"
ssh-keyscan nomad.schier.dev >> ~/.ssh/known_hosts

echo "Generating Nomad job spec"
cat ./deployment/job.tpl.hcl | \
  sed "s|__CSRF_KEY__|${CSRF_KEY}|g" | \
  sed "s|__DATABASE_URL__|${DATABASE_URL}|g" | \
  sed "s|__DEPLOY_LABEL__|${DOCKER_TAG}|g" | \
  sed "s|__DO_REGISTRY_TOKEN__|${DO_REGISTRY_TOKEN}|g" | \
  sed "s|__DO_SPACES_KEY__|${DO_SPACES_KEY}|g" | \
  sed "s|__DO_SPACES_SECRET__|${DO_SPACES_SECRET}|g" | \
  sed "s|__MAILJET_PRV_KEY__|${MAILJET_PRV_KEY}|g" | \
  sed "s|__MAILJET_PUB_KEY__|${MAILJET_PUB_KEY}|g" | \
  sed "s|__DOCKER_TAG__|${DOCKER_TAG}|g" \
  > ./job.hcl

echo "Deploying to Nomad"
scp ./job.hcl root@nomad.schier.dev:/tmp/schierco.hcl
ssh "root@${NOMAD_IP}" nomad job run -address="http://${NOMAD_IP_PRV}:4646 /tmp/schierco.hcl"

