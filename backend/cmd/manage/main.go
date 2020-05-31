package main

import (
	"context"
	"errors"
	"fmt"
	"github.com/gschier/schier.dev/internal"
	"github.com/gschier/schier.dev/internal/migrate"
	"github.com/gschier/schier.dev/migrations"
	"gopkg.in/alecthomas/kingpin.v2"
	"log"
	"os"
	"time"
)

var Cmd = kingpin.New("manage", "")

func main() {
	ctx := context.Background()

	initMigrate(ctx)
	initSendNewsletter(ctx)

	_, err := Cmd.Parse(os.Args[1:])
	if err != nil {
		panic(err)
	}
}

func initMigrate(ctx context.Context) {
	cmd := Cmd.Command("migrate", "Run migration commands")
	yesAll := cmd.Flag("yes", "Confirm all things").Bool()

	cmdForward := cmd.Command("forward", "Apply all pending migrations")
	cmdForward.Action(func(x *kingpin.ParseContext) error {
		migrate.ForwardAll(ctx, migrations.All(), internal.NewStorage().DB(), *yesAll)
		return nil
	})

	cmdBackward := cmd.Command("backward", "Revert last migration")
	cmdBackward.Action(func(x *kingpin.ParseContext) error {
		migrate.BackwardOne(ctx, migrations.All(), internal.NewStorage().DB(), *yesAll)
		return nil
	})
}

func initSendNewsletter(ctx context.Context) {
	cmd := Cmd.Command("newsletter", "Send blog post update")
	slug := *cmd.Arg("slug", "Blog post slug").Required().Required().String()
	email := cmd.Arg("email", "Specify an email to send to").String()

	cmd.Action(func(x *kingpin.ParseContext) error {
		db := internal.NewStorage()

		subscribers := make([]internal.Subscriber, 0)
		if email != nil {
			var s *internal.Subscriber
			s, err := db.NewsletterSubscriberByEmail(ctx, *email)
			if err != nil || s == nil {
				return errors.New("failed to get subscriber by email")
			}
			subscribers = append(subscribers, *s)
		} else {
			var err error
			subscribers, err = db.Subscribers(ctx)
			if err != nil {
				return err
			}
		}

		blogPost, err := db.BlogPostBySlug(ctx, slug)
		if err != nil {
			return err
		}
		if !blogPost.Published {
			return errors.New("blog post not published")
		}

		newsletterKey := blogPost.ID
		if email != nil {
			newsletterKey = fmt.Sprintf("TEST:%s:%d:%s", *email, time.Now().Unix(), newsletterKey)
		}
		newsletter, err := db.NewsletterSendByKey(ctx, newsletterKey)
		if newsletter != nil {
			log.Println("Newsletter already sent for post", newsletter.ID, blogPost.Slug)
			return nil
		}

		sent := 0
		for _, sub := range subscribers {
			if sub.Unsubscribed {
				log.Println("Skip unsubscribed email", sub.Email)
				continue
			}

			err := internal.SendNewPostTemplate(blogPost, &sub)
			if err != nil {
				log.Panicln("failed to send email", err.Error())
			}

			log.Println("Sent email to", sub.Email)
			sent++
		}

		err = db.CreateNewsletterSend(
			ctx,
			newsletterKey,
			len(subscribers),
			fmt.Sprintf("Blog Post: %s", blogPost.Title),
		)
		if err != nil {
			return err
		}

		log.Printf("Sent newsletter to %d recipients\n", sent)

		return nil
	})
}
