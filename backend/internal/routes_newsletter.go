package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
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
	client := ctxDB(r)

	subscribers, err := client.RecentSubscribers(r.Context())
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
		"pageTitle":       "Thanks!",
		"pageDescription": "Thank you for signing up to the newsletter!",
	})
}

func routeUnsubscribe(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	db := ctxDB(r)

	sub, err := db.SubscriberByID(r.Context(), id)
	if err != nil {
		log.Println("Failed to get subscriber", err.Error())
		http.Error(w, "Failed to unsubscribe", http.StatusInternalServerError)
		return
	}

	err = db.UnsubscribeSubscriber(r.Context(), id)
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

	db := ctxDB(r)

	err := db.UpsertNewsletterSubscriber(r.Context(), email, name)
	if err != nil {
		log.Println("Failed to upsert subscriber:", err.Error())
		http.Error(w, "Failed to subscribe", http.StatusInternalServerError)
		return
	}

	sub, err := db.NewsletterSubscriberByEmail(r.Context(), email)
	if err != nil {
		log.Println("Failed to get subscriber:", err.Error())
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
