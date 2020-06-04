#!/bin/bash

mkdir -p ~/.ssh && echo "${SSH_PRIVATE_KEY}" | tr -d '\r' > ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa
ssh-keyscan nomad.schier.dev >> ~/.ssh/known_hosts

cat ./deployment/job.tpl.hcl | \
  sed "s|__GITHUB_REPOSITORY__|${GITHUB_REPOSITORY}|g" | \
  sed "s|__GIT_SHA__|${GIT_SHA}|g" | \
  cat > ./job.hcl

scp ./job.hcl root@nomad.schier.dev:/tmp/schierco.hcl
ssh "root@nomad.schier.dev" nomad job run -address="http://${NOMAD_IP_PRV}:4646 /tmp/schierco.hcl"

