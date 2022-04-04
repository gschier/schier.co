package internal

import (
	"errors"
	"fmt"
	gen "github.com/gschier/schier.co/internal/db"
	"log"
	"time"
)

func SendNewsletter(slug, email string) (*gen.NewsletterSend, error) {
	subscribers := make([]gen.NewsletterSubscriber, 0)
	if email != "" {
		var s *gen.NewsletterSubscriber
		s, err := NewStorage().Store.NewsletterSubscribers.Filter(
			gen.Where.NewsletterSubscriber.Email.Eq(email),
		).One()
		if err != nil {
			return nil, errors.New("failed to get subscriber by email")
		}
		subscribers = append(subscribers, *s)
	} else {
		var err error
		subscribers, err = NewStorage().Store.NewsletterSubscribers.All()
		if err != nil {
			return nil, err
		}
	}

	blogPost, err := NewStorage().Store.BlogPosts.Filter(
		gen.Where.BlogPost.Slug.Eq(slug),
	).One()
	if err != nil {
		return nil, errors.New("no blog post found for slug \"" + slug + "\"")
	}

	if time.Now().Sub(blogPost.Date) > time.Hour*24 {
		return nil, errors.New("blog post too old")
	}

	if !blogPost.Published {
		return nil, errors.New("blog post not published")
	}

	newsletterKey := blogPost.ID
	if email != "" {
		newsletterKey = fmt.Sprintf("TEST:%s:%d:%s", email, time.Now().Unix(), newsletterKey)
	}
	newsletterSend, _ := NewStorage().Store.NewsletterSends.Filter(
		gen.Where.NewsletterSend.Key.Eq(newsletterKey),
	).One()
	if newsletterSend != nil {
		return nil, errors.New("Newsletter already sent (" + newsletterSend.ID + ") for post " + blogPost.Slug)
	}

	sent := 0
	for _, sub := range subscribers {
		if sub.Unsubscribed {
			log.Println("Skip unsubscribed email", sub.Email)
			continue
		}

		err := SendNewPostTemplate(blogPost, &sub)
		if err != nil {
			log.Panicln("failed to send email", err.Error())
		}

		log.Println("Sent email to", sub.Email)
		sent++
	}

	newNewsletterSend := NewStorage().Store.NewsletterSends.InsertP(
		gen.Set.NewsletterSend.Key(newsletterKey),
		gen.Set.NewsletterSend.Recipients(int64(len(subscribers))),
		gen.Set.NewsletterSend.Description(fmt.Sprintf("Blog Post: %s", blogPost.Title)),
	)

	log.Printf("Sent newsletter to %d recipients\n", sent)

	return newNewsletterSend, nil
}
