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
	// A Content-Type header has to be set before calling w.WriteHeader,
	// otherwise WriteHeader is called twice (from this handler and
	// the compression handler) and the response breaks.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	renderTemplate(w, r, notFoundTemplate(), nil)
}
