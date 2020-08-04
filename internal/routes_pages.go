package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"net/http"
	"strings"
)

func PagesRoutes(router *mux.Router) {
	router.HandleFunc("/", routeHome).Methods(http.MethodGet)
	router.HandleFunc("/projects", routeProjects).Methods(http.MethodGet)
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
var projectsTemplate = pageTemplate("page/projects.html")

func routeRobotsTxt(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(robots))
}

func routeProjects(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, projectsTemplate(), &pongo2.Context{
		"pageTitle":       "Projects",
		"pageDescription": "Projects I'm currently working on",
	})
}

func routeHome(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, homeTemplate(), &pongo2.Context{
		"blogPosts": recommendedBlogPosts(ctxDB(r).Store, nil, 10).AllP(),
		"pageTitle": "Gregory Schier",
	})
}
