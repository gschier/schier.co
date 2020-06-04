#!/bin/bash

cat ./deployment/job.tpl.hcl | sed "s|__GIT_SHA__|${GIT_SHA}|g" > ./job.hcl

mkdir -p ~/.ssh && echo "${SSH_PRIVATE_KEY}" | tr -d '\r' > ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa
ssh-keyscan nomad.schier.dev >> ~/.ssh/known_hosts

scp ./job.hcl root@nomad.schier.dev:/tmp/schierco.hcl
ssh "root@nomad.schier.dev" nomad job run \
  -address="http://${NOMAD_IP_PRV}:4646" \
  -token="${NOMAD_TOKEN}" \
  /tmp/schierco.hcl

