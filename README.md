# schier.co [![Deploy](https://github.com/gschier/schier.co/workflows/Deploy/badge.svg)](https://github.com/gschier/schier.co/actions?query=workflow%3ADeploy)

This is the source code for my personal website [schier.co](https://schier.co).

## Requirements

- [wyp](https://github.com/gschier/will-you-please) for running tasks
- [Docker](https://www.docker.com) for running the server
- [NodeJS](https://nodejs.org/en/) for running the frontend

## Development

```bash
# Migrate/init database
wyp migrate

# Run Tests
wyp test

# Run backend and frontend
wyp start
```
