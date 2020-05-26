package internal

import (
	"encoding/json"
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func MiscRoutes(router *mux.Router) {
	router.HandleFunc("/debug/headers", routeHeaders).Methods(http.MethodGet)
	router.HandleFunc("/debug/health", routeHealthCheck).Methods(http.MethodGet)
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

var _t = time.Now()
func routeHealthCheck(w http.ResponseWriter, r *http.Request) {
	db := NewStorage()

	blogPostCount := 0
	pgConns := 0

	_ = db.DB().GetContext(r.Context(), &pgConns, `SELECT sum(numbackends) FROM pg_stat_database`)
	_ = db.DB().GetContext(r.Context(), &blogPostCount, `SELECT COUNT(id) FROM blog_posts`)

	err := json.NewEncoder(w).Encode(&map[string]interface{}{
		"host": r.Host,
		"base_url": os.Getenv("BASE_URL"),
		"commit": fmt.Sprintf("https://github.com/%s/commit/%s", os.Getenv("GITHUB_REPOSITORY"), os.Getenv("")),
		"deployed": fmt.Sprintf("%d seconds ago", time.Now().Sub(_t).Seconds()),
		"pg_conns": pgConns,
	})

	if err != nil {
		panic(err)
	}
}
