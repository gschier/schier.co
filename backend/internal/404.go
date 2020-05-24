package backend

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
)

func NotFoundRoutes(router *mux.Router) {
	router.NotFoundHandler = http.HandlerFunc(routeNotFound)
}

var notFoundTemplate = pageTemplate("404.html")

func routeNotFound(w http.ResponseWriter, r *http.Request) {
	// Can't get from request context because middleware didn't run
	client := schier.NewPrismaClient()

	blogPosts, err := client.BlogPosts(RecentBlogPosts(6, nil)).Exec(r.Context())
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
		"blogPosts": blogPosts,
		"doNotTrack": true,
	})
}
