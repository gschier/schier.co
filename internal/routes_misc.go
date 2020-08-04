package internal

import (
	"encoding/json"
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func MiscRoutes(router *mux.Router) {
	router.HandleFunc("/debug/headers", routeHeaders).Methods(http.MethodGet)
	router.HandleFunc("/debug/health", routeHealthCheck).Methods(http.MethodGet)
	router.HandleFunc("/debug/static", routeListStatic).Methods(http.MethodGet)
	router.NotFoundHandler = http.HandlerFunc(routeNotFound)
}

var notFoundTemplate = pageTemplate("404.html")
var startTime = time.Now()

func routeNotFound(w http.ResponseWriter, r *http.Request) {
	// Can't get from request context because middleware didn't run
	blogPosts, err := NewStorage().RecentBlogPosts(r.Context(), 6)
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

func routeHealthCheck(w http.ResponseWriter, r *http.Request) {
	blogPostCount := 0
	pgConns := 0

	_ = ctxDB(r).DB().QueryRowContext(r.Context(), `SELECT sum(numbackends) FROM pg_stat_database`).Scan(&pgConns)
	_ = ctxDB(r).DB().QueryRowContext(r.Context(), `SELECT COUNT(id) FROM blog_posts`).Scan(&blogPostCount)

	err := json.NewEncoder(w).Encode(&map[string]interface{}{
		"host":     r.Host,
		"base_url": os.Getenv("BASE_URL"),
		"deployed": fmt.Sprintf("%d seconds ago", int(time.Now().Sub(startTime).Seconds())),
		"pg_conns": pgConns,
	})

	if err != nil {
		panic(err)
	}
}

func routeListStatic(w http.ResponseWriter, r *http.Request) {
	listDirRecursive(w, staticRoot, 0)
}

func listDirRecursive(w io.Writer, dir string, depth int) {
	entries, _ := ioutil.ReadDir(dir)
	for _, e := range entries {
		fullPath := filepath.Join(dir, e.Name())
		if e.IsDir() {
			listDirRecursive(w, fullPath, depth+1)
			continue
		}
		_, _ = fmt.Fprintln(w, fullPath)
	}
}
