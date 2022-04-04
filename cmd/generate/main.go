package main

import (
	"github.com/gschier/banister"
	_ "github.com/gschier/banister/backends/postgres"
	"github.com/gschier/schier.co/cmd/generate/models"
)

func main() {
	config := &banister.GenerateConfig{
		Backend:     "postgres",
		OutputDir:   "./internal/db",
		PackageName: "gen",
		MultiFile:   false,
		Models: []banister.Model{
			models.User,
			models.Session,
			models.BlogPost,
			models.NewsletterSubscriber,
			models.NewsletterSend,
		},
	}

	err := banister.Generate(config)
	if err != nil {
		panic(err)
	}
}
