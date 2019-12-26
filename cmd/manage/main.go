package main

import (
	"context"
	"flag"
	"fmt"
	schier "github.com/gschier/schier.dev"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"golang.org/x/crypto/bcrypt"
	"gopkg.in/yaml.v2"
	"io/ioutil"
	"log"
	"os"
	"time"
)

func main() {
	flag.Parse()
	name := flag.Args()[0]

	if name == "send-newsletter" {
		sendNewsletter(flag.Args()[1:])
	} else if name == "fixtures" {
		installFixtures()
	} else {
		log.Panicln("invalid command", name)
	}
}

func sendNewsletter(args []string) {
	slug := args[0]

	if slug == "" {
		log.Println("No slug specified")
		os.Exit(1)
	}

	var email *string = nil
	if len(args) == 2 {
		email = prisma.Str(args[1])
	}

	client := schier.NewPrismaClient()
	subscribers, err := client.Subscribers(&prisma.SubscribersParams{
		Where: &prisma.SubscriberWhereInput{
			Email:        email,
			Unsubscribed: prisma.Bool(false),
		},
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("failed to query subscribers", err.Error())
	}

	blogPosts, err := client.BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Slug: &slug,
			Published: prisma.Bool(true),
		},
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("Failed to query blog post", slug, err.Error())
	}
	if len(blogPosts) == 0 {
		log.Panicln("Blog post no found", slug)
	}

	blogPost := &blogPosts[0]

	newsletterKey := blogPost.ID
	if email != nil {
		newsletterKey = fmt.Sprintf("TEST:%s:%d:%s", *email, time.Now().Unix(), newsletterKey)
	}
	newsletter, err := client.NewsletterSend(prisma.NewsletterSendWhereUniqueInput{
		Key: &newsletterKey,
	}).Exec(context.Background())
	if newsletter != nil {
		log.Println("Newsletter already sent for post", newsletter.ID, blogPost.Slug)
		os.Exit(0)
	}

	for _, sub := range subscribers {
		err := web.SendNewPostTemplate(blogPost, &sub)
		if err != nil {
			log.Panicln("failed to send email", err.Error())
		}
		log.Println("Sent email to", sub.Email)
	}

	send, err := client.CreateNewsletterSend(prisma.NewsletterSendCreateInput{
		Key:         newsletterKey,
		Recipients:  int32(len(subscribers)),
		Description: fmt.Sprintf("Blog Post: %s", blogPost.Title),
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("failed to create NewsletterSend", err.Error())
	}

	log.Printf("Sent newsletter to %d recipients\n", send.Recipients)
}

func installFixtures() {
	client := schier.NewPrismaClient()

	count := 0
	count += processUsers(client)
	count += processProjects(client)
	count += processFavoriteThings(client)
	count += processBooks(client)

	log.Printf("Installed %d fixtures\n", count)
}

func processUsers(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/users.yaml")
	if err != nil {
		panic(err)
	}

	var users []*prisma.User
	err = yaml.Unmarshal(b, &users)
	if err != nil {
		panic(err)
	}

	for _, u := range users {
		pwdHash, _ := bcrypt.GenerateFromPassword([]byte(os.Getenv("USER_PASSWORD")), bcrypt.DefaultCost)
		_, err := client.UpsertUser(prisma.UserUpsertParams{
			Where: prisma.UserWhereUniqueInput{
				Email: &u.Email,
			},
			Create: prisma.UserCreateInput{
				Type:         &u.Type,
				Email:        u.Email,
				Name:         u.Name,
				PasswordHash: string(pwdHash),
			},
			Update: prisma.UserUpdateInput{
				Type:         &u.Type,
				Email:        &u.Email,
				Name:         &u.Name,
				PasswordHash: prisma.Str(string(pwdHash)),
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(users)
}

func processFavoriteThings(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/favorite-things.yaml")
	if err != nil {
		panic(err)
	}

	var favoriteThings []*prisma.FavoriteThing
	err = yaml.Unmarshal(b, &favoriteThings)
	if err != nil {
		panic(err)
	}

	for i, p := range favoriteThings {
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

	return len(favoriteThings)
}

func processBooks(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/books.yaml")
	if err != nil {
		panic(err)
	}

	var books []*prisma.Book
	err = yaml.Unmarshal(b, &books)
	if err != nil {
		panic(err)
	}

	for _, p := range books {
		_, err := client.UpsertBook(prisma.BookUpsertParams{
			Where: prisma.BookWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.BookCreateInput{
				ID:     &p.ID,
				Rank:   p.Rank,
				Title:  p.Title,
				Author: p.Author,
				Link:   p.Link,
			},
			Update: prisma.BookUpdateInput{
				Title:  &p.Title,
				Author: &p.Author,
				Rank:   p.Rank,
				Link:   p.Link,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(books)
}

func processProjects(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/projects.yaml")
	if err != nil {
		panic(err)
	}

	var projects []*prisma.Project
	err = yaml.Unmarshal(b, &projects)
	if err != nil {
		panic(err)
	}

	for i, p := range projects {
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

	return len(projects)
}
