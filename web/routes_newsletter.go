package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
)

func NewsletterRoutes(router *mux.Router) {
	router.HandleFunc("/newsletter", routeNewsletter).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/thanks", routeThankSubscriber).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/unsubscribe/{id}", routeUnsubscribe).Methods(http.MethodGet)
	router.HandleFunc("/forms/newsletter/subscribe", routeSubscribe).Methods(http.MethodPost)
}

var newsletterTemplate = pageTemplate("page/newsletter.html")
var newsletterThanksTemplate = pageTemplate("page/thanks.html")
var newsletterUnsubscribeTemplate = pageTemplate("page/unsubscribe.html")

func routeNewsletter(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterTemplate(), nil)
}

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
			Email:        email,
			Name:         name,
			Unsubscribed: false,
		},
		Update: prisma.SubscriberUpdateInput{
			Unsubscribed: prisma.Bool(false),
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
