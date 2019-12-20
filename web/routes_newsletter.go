package web

import (
	"encoding/base64"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
)

func NewsletterRoutes(router *mux.Router) {
	router.HandleFunc("/newsletter/thanks", routeThankSubscriber).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/confirm/{emailHash}", routeSubscribeConfirm).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/confirmed", routeSubscribeConfirmed).Methods(http.MethodGet)
	router.HandleFunc("/forms/newsletter/subscribe", routeSubscribe).Methods(http.MethodPost)
}

var newsletterThanksTemplate = pageTemplate("page/thanks.html")
var newsletterConfirmedTemplate = pageTemplate("page/confirmed.html")

func routeThankSubscriber(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterThanksTemplate(), nil)
}

func routeSubscribeConfirmed(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterConfirmedTemplate(), nil)
}

func routeSubscribeConfirm(w http.ResponseWriter, r *http.Request) {
	emailHash := mux.Vars(r)["emailHash"]

	emailBytes, err := base64.StdEncoding.DecodeString(emailHash)
	if err != nil {
		http.Error(w, "Failed to subscribe", http.StatusBadRequest)
		return
	}

	email := string(emailBytes)

	client := ctxPrismaClient(r)
	_, err = client.UpdateSubscriber(prisma.SubscriberUpdateParams{
		Data: prisma.SubscriberUpdateInput{
			Confirmed: prisma.Bool(true),
		},
		Where: prisma.SubscriberWhereUniqueInput{
			Email: &email,
		},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to update subscriber:", err.Error())
		http.Error(w, "Failed to update subscription", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/newsletter/confirmed", http.StatusSeeOther)
}

func routeSubscribe(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	email := r.Form.Get("email")
	name := r.Form.Get("name")

	client := ctxPrismaClient(r)

	_, err := client.UpsertSubscriber(prisma.SubscriberUpsertParams{
		Where: prisma.SubscriberWhereUniqueInput{Email: &email},
		Create: prisma.SubscriberCreateInput{
			Email:     email,
			Name:      name,
			Confirmed: false,
		},
		Update: prisma.SubscriberUpdateInput{
			Confirmed: prisma.Bool(false),
		},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to create subscriber:", err.Error())
		http.Error(w, "Failed to subscribe", http.StatusInternalServerError)
		return
	}

	err = SendSubscriberMessage(name, email)
	if err != nil {
		log.Println("Failed to send subscription confirmation:", err.Error())
		http.Error(w, "Failed to send email", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/newsletter/thanks", http.StatusSeeOther)
}
