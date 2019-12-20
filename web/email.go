package web

import (
	"encoding/base64"
	"github.com/mailjet/mailjet-apiv3-go"
	"log"
	"os"
)

var mj = mailjet.NewMailjetClient(
	os.Getenv("MAILJET_PUB_KEY"),
	os.Getenv("MAILJET_PRV_KEY"),
)

func SendSubscriberMessage(name, email string) error {
	messages := &mailjet.MessagesV31{
		SandBoxMode: false,
		Info: []mailjet.InfoMessagesV31{{
			From: &mailjet.RecipientV31{
				Name:  "Greg Schier",
				Email: "mail@schier.co",
			},
			To: &mailjet.RecipientsV31{{
				Name:  name,
				Email: email,
			}},
			Variables: map[string]interface{}{
				"confirmation_url": os.Getenv("BASE_URL") + "/newsletter/confirm/" +
					base64.StdEncoding.EncodeToString([]byte(email)),
			},
			TemplateErrorDeliver: true,
			TemplateErrorReporting: &mailjet.RecipientV31{
				Email: "greg@schier.co",
				Name:  "Gregory Schier",
			},
			Subject:          "Confirm Subscription",
			TemplateLanguage: true,
			TemplateID:       1147903,
		}},
	}
	_, err := mj.SendMailV31(messages)
	if err != nil {
		log.Println("Failed to send email:", err.Error())
		return err
	}

	return nil
}
