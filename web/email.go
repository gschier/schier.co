package web

import (
	"fmt"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/mailjet/mailjet-apiv3-go"
	"log"
	"os"
)

var mj = mailjet.NewMailjetClient(
	os.Getenv("MAILJET_PUB_KEY"),
	os.Getenv("MAILJET_PRV_KEY"),
)

const templateConfirmSubscription = 1147903
const templateNewPost = 1150884

func SendNewPostTemplate(post *prisma.BlogPost, sub *prisma.Subscriber) error {
	u := fmt.Sprintf("%s/blog/%s", os.Getenv("BASE_URL"), post.Slug)
	unsub := fmt.Sprintf("%s/newsletter/unsubscribe/%s", os.Getenv("BASE_URL"), sub.ID)
	return SendTemplate(templateNewPost, sub, map[string]interface{}{
		"post_title": post.Title,
		"post_readtime": ReadTime(WordCount(post.Content)),
		"post_summary": Summary(post.Content),
		"post_href": u,
		"unsubscribe_url": unsub,
	})
}

func SendSubscriberTemplate(sub *prisma.Subscriber) error {
	u := fmt.Sprintf("%s/newsletter/confirm/%s", os.Getenv("BASE_URL"), sub.ID)
	return SendTemplate(templateConfirmSubscription, sub, map[string]interface{}{
		"confirmation_url": u,
	})
}

func SendTemplate(id int, sub *prisma.Subscriber, variables map[string]interface{}) error {
	if os.Getenv("MAILJET_PRV_KEY") == "" {
		log.Println("Sent no-op email", sub)
		return nil
	}

	messages := &mailjet.MessagesV31{
		SandBoxMode: false,
		Info: []mailjet.InfoMessagesV31{{
			To: &mailjet.RecipientsV31{{
				Name:  sub.Name,
				Email: sub.Email,
			}},
			Variables: variables,
			TemplateErrorDeliver: true,
			TemplateErrorReporting: &mailjet.RecipientV31{
				Email: "greg@schier.co",
				Name:  "Gregory Schier",
			},
			TemplateLanguage: true,
			TemplateID:       id,
		}},
	}
	_, err := mj.SendMailV31(messages)
	if err != nil {
		log.Println("Failed to send email:", err.Error())
		return err
	}

	return nil
}
