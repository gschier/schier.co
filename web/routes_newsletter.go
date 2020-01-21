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
	client := ctxPrismaClient(r)

	orderBy := prisma.SubscriberOrderByInputCreatedAtDesc
	subscribers, err := client.Subscribers(&prisma.SubscribersParams{
		OrderBy: &orderBy,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch subscribers", err.Error())
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, newsletterTemplate(), &pongo2.Context{
		"pageTitle":       "Email Newsletter",
		"pageDescription": "Subscribe to the newsletter to be the first to hear about new posts",
		"subscribers":     subscribers,
	})
}

func routeThankSubscriber(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterThanksTemplate(), &pongo2.Context{
		"pageTitle": "Thanks!",
		"pageDescription": "Thank you for signing up to the newsletter!",
	})
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
		"pageTitle": "Unsubscribed",
		"email":     sub.Email,
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
