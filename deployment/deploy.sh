#!/bin/bash

echo "Writing SSH key"
mkdir -p ~/.ssh && echo "${SSH_PRIVATE_KEY}" | tr -d '\r' > ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa

echo "Adding to known hosts"
ssh-keyscan nomad.schier.dev >> ~/.ssh/known_hosts

echo "Generating Nomad job spec"
cat ./deployment/job.tpl.hcl | \
  sed "s|__GITHUB_REPOSITORY__|${GITHUB_REPOSITORY}|g" | \
  sed "s|__GITHUB_SHA__|${GITHUB_SHA}|g" | \
  cat > ./job.hcl

echo "Deploying to Nomad"
scp ./job.hcl root@nomad.schier.dev:/tmp/schierco.hcl
ssh "root@${NOMAD_IP}" nomad job run -address="http://${NOMAD_IP_PRV}:4646 /tmp/schierco.hcl"

