package main

import (
	schier "github.com/gschier/schier.dev"
)

func main() {
	client := schier.NewPrismaClient()
	schier.InstallFixtures(client)
}
