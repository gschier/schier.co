package main

import (
	"context"
	schier "github.com/gschier/schier.dev"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"gopkg.in/yaml.v2"
	"io/ioutil"
	"log"
)

func main() {
	client := schier.NewPrismaClient()

	processProjects(client)
	processFavoriteThings(client)
}

func processFavoriteThings(client *prisma.Client) {
	b, err := ioutil.ReadFile("cmd/fixtures/data/favorite-things.yaml")
	if err != nil {
		panic(err)
	}

	var favoriteThings []*prisma.FavoriteThing
	err = yaml.Unmarshal(b, &favoriteThings)
	if err != nil {
		panic(err)
	}

	for i, p := range favoriteThings {
		log.Println("Adding FavoriteThing:", p.ID)
		priority := int32(i)
		_, err := client.UpsertFavoriteThing(prisma.FavoriteThingUpsertParams{
			Where: prisma.FavoriteThingWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.FavoriteThingCreateInput{
				Priority:    priority,
				ID:          &p.ID,
				Name:        p.Name,
				Link:        p.Link,
				Description: p.Description,
			},
			Update: prisma.FavoriteThingUpdateInput{
				Priority:    prisma.Int32(priority),
				Name:        &p.Name,
				Link:        &p.Link,
				Description: &p.Description,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}
}

func processProjects(client *prisma.Client) {
	b, err := ioutil.ReadFile("cmd/fixtures/data/projects.yaml")
	if err != nil {
		panic(err)
	}

	var projects []*prisma.Project
	err = yaml.Unmarshal(b, &projects)
	if err != nil {
		panic(err)
	}

	for i, p := range projects {
		log.Println("Adding Project:", p.ID)
		priority := int32(i)
		_, err := client.UpsertProject(prisma.ProjectUpsertParams{
			Where: prisma.ProjectWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.ProjectCreateInput{
				Priority:    priority,
				ID:          &p.ID,
				Name:        p.Name,
				Link:        p.Link,
				Icon:        p.Icon,
				Description: p.Description,
				Retired:     p.Retired,
				Revenue:     p.Revenue,
				Reason:      p.Reason,
			},
			Update: prisma.ProjectUpdateInput{
				Priority:    prisma.Int32(priority),
				Name:        &p.Name,
				Link:        &p.Link,
				Icon:        &p.Icon,
				Description: &p.Description,
				Retired:     &p.Retired,
				Revenue:     &p.Revenue,
				Reason:      p.Reason,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}
}
