package internal

import (
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"strings"
)

func MiscRoutes(router *mux.Router) {
	router.HandleFunc("/debug/headers", routeHeaders).Methods(http.MethodGet)
	router.NotFoundHandler = http.HandlerFunc(routeNotFound)
}

var notFoundTemplate = pageTemplate("404.html")

func routeNotFound(w http.ResponseWriter, r *http.Request) {
	// Can't get from request context because middleware didn't run
	db := NewStorage()

	blogPosts, err := db.RecentBlogPosts(r.Context(), 6)
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	// A Content-Type header has to be set before calling w.WriteHeader,
	// otherwise WriteHeader is called twice (from this handler and
	// the compression handler) and the response breaks.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	renderTemplate(w, r, notFoundTemplate(), &pongo2.Context{
		"blogPosts":  blogPosts,
		"doNotTrack": true,
	})
}

func routeHeaders(w http.ResponseWriter, r *http.Request) {
	_, _ = fmt.Fprintf(w, "Host: %s\n", r.Host)
	for n, v := range r.Header {
		_, _ = fmt.Fprintf(w, "%s: %s\n", n, strings.Join(v, " --- "))
	}
}
