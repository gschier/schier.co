package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
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
Disallow: /login
Disallow: /register
`)

var robotsNone = strings.TrimSpace(`
User-agent: *
Disallow: *
`)

var homeTemplate = pageTemplate("page/home.html")
var aboutTemplate = pageTemplate("page/about.html")
var projectsTemplate = pageTemplate("page/projects.html")

func routeRobotsTxt(w http.ResponseWriter, r *http.Request) {
	if r.Host == "schier.co" {
		_, _ = w.Write([]byte(robots))
	} else {
		_, _ = w.Write([]byte(robotsNone))
	}
}

func routeProjects(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)

	projectOrderBy := prisma.ProjectOrderByInputPriorityAsc
	projects, err := client.Projects(
		&prisma.ProjectsParams{OrderBy: &projectOrderBy},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, projectsTemplate(), &pongo2.Context{
		"pageTitle": "Projects",
		"projects": projects,
	})
}

func routeHome(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)
	blogPosts, err := client.BlogPosts(RecentBlogPosts(6)).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, homeTemplate(), &pongo2.Context{
		"blogPosts": blogPosts,
	})
}

func routeAbout(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)

	projectOrderBy := prisma.ProjectOrderByInputPriorityAsc
	projects, err := client.Projects(
		&prisma.ProjectsParams{OrderBy: &projectOrderBy},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	favoriteThingOrderBy := prisma.FavoriteThingOrderByInputPriorityAsc
	favoriteThings, err := client.FavoriteThings(
		&prisma.FavoriteThingsParams{OrderBy: &favoriteThingOrderBy},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch projects: " + err.Error())
		http.Error(w, "Failed to fetch projects", http.StatusInternalServerError)
		return
	}

	blogPosts, err := client.BlogPosts(RecentBlogPosts(5)).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	// Fetch books
	orderBy := prisma.BookOrderByInputRankAsc
	books, err := ctxPrismaClient(r).Books(&prisma.BooksParams{
		OrderBy: &orderBy,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load books", err)
		http.Error(w, "Failed to load books", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, aboutTemplate(), &pongo2.Context{
		"pageTitle":      "About",
		"favoriteThings": favoriteThings,
		"projects":       projects,
		"blogPosts":      blogPosts,
		"books":          books,
	})
}
