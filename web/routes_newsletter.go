package web

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"net/http"
)

func NewsletterRoutes(router *mux.Router) {
	router.HandleFunc("/newsletter/thanks", routeNewsletterThanks).Methods(http.MethodGet)
	router.HandleFunc("/forms/newsletter/subscribe", routeNewsletterSubscribe).Methods(http.MethodPost)
}

var newsletterThanksTemplate = pageTemplate("page/thanks.html")

func routeNewsletterThanks(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, newsletterThanksTemplate(), nil)
}

func routeNewsletterSubscribe(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	email := r.Form.Get("email")
	name := r.Form.Get("name")

	client := ctxPrismaClient(r)

	_, err := client.CreateSubscriber(prisma.SubscriberCreateInput{
		Email: email,
		Name:  name,
	}).Exec(r.Context())
	if err != nil {
		http.Error(w, "Failed to subscribe", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/newsletter/thanks", http.StatusFound)
}
