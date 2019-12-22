package main

import (
	"context"
	"flag"
	"fmt"
	schier "github.com/gschier/schier.dev"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"log"
	"os"
	"time"
)

func main() {
	flag.Parse()
	name := flag.Args()[0]

	if name == "send-newsletter" {
		sendNewsletter(flag.Args()[1:])
	}

	log.Panicln("invalid command", name)
}

func sendNewsletterTest(args []string) {
	slug := args[0]
	email := args[1]

	if slug == "" {
		log.Println("No slug specified")
		os.Exit(1)
	}

	if email == "" {
		log.Println("No email specified")
		os.Exit(1)
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
			Confirmed:    prisma.Bool(true),
			Unsubscribed: prisma.Bool(false),
		},
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("failed to query subscribers", err.Error())
	}

	blogPost, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug}).Exec(context.Background())
	if err != nil {
		log.Panicln("Failed to query blog post", slug, err.Error())
	}

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
