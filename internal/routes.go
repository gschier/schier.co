package internal

import (
	"encoding/json"
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/markbates/pkger"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func init() {
	pkger.Include(staticRoot)
}

const staticRoot = "/frontend/static"
const robots = `
User-agent: *
Disallow: /open
Disallow: /blog/drafts
Disallow: /newsletter/thanks
Disallow: /newsletter/unsubscribe/*
Disallow: /login
Disallow: /register
Disallow: /blog/*/share/*
Disallow: /blog/tags/*
Disallow: /debug/*
`

func BaseRoutes(router *mux.Router) {
	// Basic page routes
	router.HandleFunc("/", routeHome).Methods(http.MethodGet)
	router.HandleFunc("/books", routeBooks).Methods(http.MethodGet)
	router.HandleFunc("/projects", routeProjects).Methods(http.MethodGet)
	router.HandleFunc("/robots.txt", routeRobotsText).Methods(http.MethodGet)

	// Debug routes
	router.HandleFunc("/debug/health", routeHealthCheck()).Methods(http.MethodGet)

	// Static file serving
	router.PathPrefix("/static/").HandlerFunc(routeStatic)
	router.PathPrefix("/static{cache}/").HandlerFunc(routeStatic)
	router.PathPrefix("/images/").HandlerFunc(routeStatic)

	router.NotFoundHandler = http.HandlerFunc(routeNotFound)
}

func routeProjects(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, pageTemplate("page/projects.html"), &pongo2.Context{
		"pageTitle":       "Projects",
		"pageDescription": "Projects I'm currently working on",
	})
}

func routeHome(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, pageTemplate("page/home.html"), &pongo2.Context{
		"blogPosts": recommendedBlogPosts(ctxDB(r).Store, nil, 10).AllP(),
		"pageTitle": "",
	})
}

func routeBooks(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, pageTemplate("page/books.html"), &pongo2.Context{
		"pageTitle": "Books",
	})
}

func routeRobotsText(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(robots))
}

func routeHealthCheck() http.HandlerFunc {
	startTime := time.Now()
	return func(w http.ResponseWriter, r *http.Request) {
		blogPostCount := 0
		pgConns := 0

		_ = ctxDB(r).Store.DB.QueryRowContext(r.Context(), `SELECT sum(numbackends) FROM pg_stat_database`).Scan(&pgConns)
		_ = ctxDB(r).Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(id) FROM blog_posts`).Scan(&blogPostCount)

		err := json.NewEncoder(w).Encode(&map[string]interface{}{
			"host":     r.Host,
			"base_url": os.Getenv("BASE_URL"),
			"deployed": fmt.Sprintf("%d seconds ago", int(time.Now().Sub(startTime).Seconds())),
			"pg_conns": pgConns,
		})

		if err != nil {
			http.Error(w, "JSON failure", http.StatusInternalServerError)
		}
	}
}

func routeStatic(w http.ResponseWriter, r *http.Request) {
	cache := mux.Vars(r)["cache"]
	p := strings.Replace(r.URL.Path, cache, "", 1)

	// Serve everything else out of static
	if strings.HasPrefix(r.URL.Path, "/static") {
		// Here, we go up a directory, to remove /static/static/...
		fullPath := path.Join(staticRoot, "..", p)
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(r.URL.Path)))
		}
		b, err := readFile(fullPath)
		if err != nil {
			routeNotFound(w, r)
			return
		}
		_, _ = w.Write(b)
		return
	}

	http.NotFound(w, r)
}

func routeNotFound(w http.ResponseWriter, r *http.Request) {
	// Can't get from request context because middleware didn't run
	blogPosts := recentBlogPosts(NewStorage().Store, 6).AllP()

	// A Content-Type header has to be set before calling w.WriteHeader,
	// otherwise WriteHeader is called twice (from this handler and
	// the compression handler) and the response breaks.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	renderTemplate(w, r, pageTemplate("404.html"), &pongo2.Context{
		"blogPosts":  blogPosts,
		"doNotTrack": true,
	})
}
