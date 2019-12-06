package web

import (
	"github.com/gorilla/mux"
	"net/http"
)

func NotFoundRoutes(router *mux.Router) {
	router.NotFoundHandler = http.HandlerFunc(routeNotFound)
}

var notFoundTemplate = pageTemplate("404.html")

func routeNotFound(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	renderTemplate(w, r, notFoundTemplate(), nil)
}
