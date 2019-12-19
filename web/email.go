package web

import (
	"context"
	"github.com/mailjet/mailjet-apiv3-go"
	"os"
)

var mj = mailjet.NewMailjetClient(os.Getenv("MAILJET_PUB_KEY"), os.Getenv("MAILJET_PRV_KEY"))

func SendSubscriberMessage(ctx context.Context) error {
	messages := &mailjet.MessagesV31{
		Info: []mailjet.InfoMessagesV31{
			{
				From: &mailjet.RecipientV31{
					Email: "greg@schier.co",
					Name:  "Greg Schier",
				},
				To: &mailjet.RecipientsV31{{
					Email: "gschier1990@gmail.com",
				}},
				Subject:                  "Test Subject",
				TrackClicks:              "",
				TrackOpens:               "",
				CustomID:                 "",
				Variables:                nil,
				EventPayload:             "",
				TemplateID:               "",
				TemplateLanguage:         false,
			},
		},
		SandBoxMode: true,
	}
	_, err := mj.SendMailV31(messages)
	return err
}
