package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"github.com/gschier/schier.dev"
	migrate "github.com/gschier/schier.dev/cmd/manage/migrations"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"gopkg.in/alecthomas/kingpin.v2"
	"log"
	"os"
	"sort"
	"strings"
	"time"
)

var Cmd = kingpin.New("manage", "")

func main() {
	flag.Parse()
	name := flag.Args()[0]

	if name == "send-newsletter" {
		sendNewsletter(flag.Args()[1:])
	} else if name == "score" {
		updateBlogPostScores()
	} else {
		log.Panicln("invalid command", name)
	}
}

func initMigrate() {
	// First, sort migrations by name so they go in the correct order
	sort.Slice(migrate.All, func(i, j int) bool {
		return strings.Compare(migrate.All[i].Name, migrate.All[j].Name) >= 0
	})

	cmd := Cmd.Command("migrate", "Run migration commands")
	yesAll := cmd.Flag("yes", "Confirm all things").Bool()
	databaseURL := cmd.Flag("url", "Override DATABASE_URL").String()

	getDB := func() *sql.DB {
		if *databaseURL == "" {
			return storage.GetDatabase().Db
		} else {
			return storage.GetDatabaseAtURL(*databaseURL).Db
		}
	}

	cmdForward := cmd.Command("forward", "Apply all pending migrations")
	cmdForward.Action(func(x *kingpin.ParseContext) error {
		migrate.ForwardAll(ctx, migrations.All(), getDB(), *yesAll)
		return nil
	})

	cmdBackward := cmd.Command("backward", "Revert last migration")
	cmdBackward.Action(func(x *kingpin.ParseContext) error {
		migrate.Undo(ctx, migrations.All(), getDB(), *yesAll)
		return nil
	})

	cmdMark := cmd.Command("mark", "Mark migration as complete")
	cmdMarkFlagMigrationName := *cmdMark.Arg("migration", "Migration name").String()
	cmdMark.Action(func(x *kingpin.ParseContext) error {
		for _, m := range migrations.All() {
			if m.Name == cmdMarkFlagMigrationName {
				migrate.Mark(ctx, getDB(), m)
				return nil
			}
		}
		os.Exit(1)
		return errors.New("Failed to find migration " + cmdMarkFlagMigrationName)
	})
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
			Slug:      &slug,
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

func updateBlogPostScores() {
	client := schier.NewPrismaClient()

	posts, err := client.BlogPosts(nil).Exec(context.Background())
	if err != nil {
		panic(err)
	}

	for _, p := range posts {
		t, _ := time.Parse(time.RFC3339, p.Date)

		// Weight it by age
		wc := int32(web.WordCount(p.Content))
		score := web.CalculateScore(time.Now().Sub(t), p.VotesUsers+p.Shares, p.Views, wc)

		_, err := client.UpdateBlogPost(prisma.BlogPostUpdateParams{
			Where: prisma.BlogPostWhereUniqueInput{ID: &p.ID},
			Data: prisma.BlogPostUpdateInput{
				Score: prisma.Int32(score),
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}
}
