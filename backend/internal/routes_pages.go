package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
	"strings"
)

func PagesRoutes(router *mux.Router) {
	router.HandleFunc("/", routeHome).Methods(http.MethodGet)
	router.HandleFunc("/projects", routeProjects).Methods(http.MethodGet)
	router.HandleFunc("/about", routeAbout).Methods(http.MethodGet)
	router.HandleFunc("/robots.txt", routeRobotsTxt).Methods(http.MethodGet)
}

var robots = strings.TrimSpace(`
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
`)

var homeTemplate = pageTemplate("page/home.html")
var aboutTemplate = pageTemplate("page/about.html")
var projectsTemplate = pageTemplate("page/projects.html")

func routeRobotsTxt(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(robots))
}

func routeProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := ctxDB(r).AllProjects(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, projectsTemplate(), &pongo2.Context{
		"pageTitle":       "Projects",
		"pageDescription": "Projects I'm currently working on",
		"projects":        projects,
	})
}

func routeHome(w http.ResponseWriter, r *http.Request) {
	blogPosts, err := ctxDB(r).RecommendedBlogPosts(r.Context(), nil, 10)
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, homeTemplate(), &pongo2.Context{
		"blogPosts": blogPosts,
		"pageTitle": "Gregory Schier",
	})
}

func routeAbout(w http.ResponseWriter, r *http.Request) {
	client := ctxDB(r)

	projects, err := ctxDB(r).AllProjects(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	favoriteThings, err := client.AllFavoriteThings(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	blogPosts, err := client.RecentBlogPosts(r.Context(), 6)
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	// Fetch books
	books, err := ctxDB(r).AllBooks(r.Context())
	if err != nil {
		log.Println("Failed to load books", err)
		http.Error(w, "Failed to load books", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, aboutTemplate(), &pongo2.Context{
		"pageTitle":       "About",
		"pageDescription": "Fun facts about me",
		"favoriteThings":  favoriteThings,
		"projects":        projects,
		"blogPosts":       blogPosts,
		"books":           books,
	})
}
