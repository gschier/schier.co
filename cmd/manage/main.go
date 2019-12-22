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
)

func main() {
	flag.Parse()
	name := flag.Args()[0]

	if name == "send-newsletter" {
		sendNewsletter()
	}
}

func sendNewsletter() {
	slug := flag.Args()[1]

	client := schier.NewPrismaClient()
	subscribers, err := client.Subscribers(&prisma.SubscribersParams{
		Where: &prisma.SubscriberWhereInput{UnsubscribedNot: prisma.Bool(true)},
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("failed to query subscribers", err.Error())
	}

	blogPost, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug}).Exec(context.Background())
	if err != nil {
		log.Panicln("Failed to query blog post", slug, err.Error())
	}

	newsletterKey := blogPost.ID
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
		Key:        newsletterKey,
		Recipients: int32(len(subscribers)),
		Description: fmt.Sprintf("Blog Post: %s", blogPost.Title),
	}).Exec(context.Background())
	if err != nil {
		log.Panicln("failed to create NewsletterSend", err.Error())
	}

	log.Printf("Sent newsletter to %d recipients\n", send.Recipients)
}
