# schier.co ![Deploy](https://github.com/gschier/schier.co/workflows/Deploy/badge.svg)

This is the source code for my personal website [schier.co](https://schier.co).

## Requirements

- [Docker](https://www.docker.com) for running server
- [NodeJS](https://nodejs.org/en/) for running frontend
- [wyp](https://github.com/gschier/will-you-please) for running tasks

## Development

```bash
# Migrate/init database
wyp migrate

# Run Tests
wyp test

# Run backend and frontend
wyp start
```

Navigate to http://localhost:8084 in your browser.

## Deployment

schier.co runs on my personal [Nomad](https://nomadproject.io) cluster on
[DigitalOcean](https://www.digitalocean.com). The Nomad Job template can be found in
the `deployment/` folder.
