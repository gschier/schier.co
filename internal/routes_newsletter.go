package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"

	gen "github.com/gschier/schier.co/internal/db"
)

func NewsletterRoutes(router *mux.Router) {
	router.HandleFunc("/newsletter", routeNewsletter).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/thanks", routeThankSubscriber).Methods(http.MethodGet)
	router.HandleFunc("/newsletter/unsubscribe/{id}", routeUnsubscribe).Methods(http.MethodGet)
	router.HandleFunc("/forms/newsletter/subscribe", routeSubscribe).Methods(http.MethodPost)
}

func routeNewsletter(w http.ResponseWriter, r *http.Request) {
	subscribers, err := ctxDB(r).Store.NewsletterSubscribers.Filter().
		Sort(gen.OrderBy.NewsletterSubscriber.CreatedAt.Desc).All()
	if err != nil {
		HttpErrorInternal(w, "Failed to get subscribers", err)
		return
	}

	renderTemplate(w, r, pageTemplate("page/newsletter.html"), &pongo2.Context{
		"pageTitle":       "Email Newsletter",
		"pageDescription": "Subscribe to the newsletter to be the first to hear about new posts",
		"subscribers":     subscribers,
	})
}

func routeThankSubscriber(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, pageTemplate("page/thanks.html"), &pongo2.Context{
		"pageTitle":       "Thanks!",
		"pageDescription": "Thank you for signing up to the newsletter!",
	})
}

func routeUnsubscribe(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	sub, err := ctxDB(r).Store.NewsletterSubscribers.Get(id)
	if err != nil {
		HttpErrorInternal(w, "Failed to get subscriber", err)
		return
	}

	sub.Unsubscribed = true
	err = ctxDB(r).Store.NewsletterSubscribers.Update(sub)
	if err != nil {
		HttpErrorInternal(w, "Failed to unsubscribe", err)
		return
	}

	renderTemplate(w, r, pageTemplate("page/unsubscribe.html"), &pongo2.Context{
		"pageTitle": "Unsubscribed",
		"email":     sub.Email,
	})
}

func routeSubscribe(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	email := r.Form.Get("email")
	name := r.Form.Get("name")
	honeypot := r.Form.Get("username")

	if email == "" {
		HttpErrorBadRequest(w, "Email address required", nil)
		return
	}

	if honeypot != "" {
		// If they filled out the honeypot, do nothing
		log.Printf("Subscriber caught by honeypot: %s", email)
		http.Redirect(w, r, "/newsletter/thanks", http.StatusSeeOther)
		return
	}

	subs := ctxDB(r).Store.NewsletterSubscribers.
		Filter(gen.Where.NewsletterSubscriber.Email.Eq(email)).AllP()

	if len(subs) == 0 {
		// Create a subscriber if none exist
		subs = append(subs, *ctxDB(r).Store.NewsletterSubscribers.InsertP(
			gen.Set.NewsletterSubscriber.Email(email),
			gen.Set.NewsletterSubscriber.Name(name),
		))
	} else {
		// Re-subscribe if already a subscriber
		subs[0].Unsubscribed = false
		ctxDB(r).Store.NewsletterSubscribers.UpdateP(&subs[0])
	}

	// Send the confirmation email
	err := SendSubscriberTemplate(&subs[0])
	if err != nil {
		log.Println("Failed to send subscription confirmation:", err.Error())
		http.Error(w, "Failed to send email", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/newsletter/thanks", http.StatusSeeOther)
}
