package web

import (
	"encoding/base64"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
)

func NewsletterRoutes(router *mux.Router) {
	router.HandleFunc("/newsletter/thanks", routeThankSubscriber).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/confirm/{emailHash}", routeSubscribeConfirm).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/confirmed", routeSubscribeConfirmed).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/unsubscribe/{id}", routeUnsubscribe).Methods(http.MethodGet)
	router.HandleFunc("/forms/newsletter/subscribe", routeSubscribe).Methods(http.MethodPost)
}

var newsletterThanksTemplate = pageTemplate("page/thanks.html")
var newsletterConfirmedTemplate = pageTemplate("page/confirmed.html")
var newsletterUnsubscribeTemplate = pageTemplate("page/unsubscribe.html")

func routeThankSubscriber(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterThanksTemplate(), nil)
}

func routeUnsubscribe(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	client := ctxPrismaClient(r)

	sub, err := client.Subscriber(prisma.SubscriberWhereUniqueInput{ID: &id}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to get subscriber", err.Error())
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	_, err = client.UpdateSubscriber(prisma.SubscriberUpdateParams{
		Where: prisma.SubscriberWhereUniqueInput{ID: &id},
		Data:  prisma.SubscriberUpdateInput{Unsubscribed: prisma.Bool(true)},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to update subscriber for unsub", err.Error())
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, newsletterUnsubscribeTemplate(), &pongo2.Context{
		"email": sub.Email,
	})
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

	if email == "" {
		http.Error(w, "Email address required", http.StatusBadRequest)
		return
	}

	client := ctxPrismaClient(r)

	sub, err := client.UpsertSubscriber(prisma.SubscriberUpsertParams{
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

	err = SendSubscriberTemplate(sub)
	if err != nil {
		log.Println("Failed to send subscription confirmation:", err.Error())
		http.Error(w, "Failed to send email", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/newsletter/thanks", http.StatusSeeOther)
}
