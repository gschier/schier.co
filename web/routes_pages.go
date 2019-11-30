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
	router.HandleFunc("/robots.txt", routeRobotsTxt).Methods(http.MethodGet)
	router.HandleFunc("/sw.js", routeServiceWorker).Methods(http.MethodGet)
}

var robots = strings.TrimSpace(`
User-agent: *
Disallow: /login
Disallow: /register
`)

var homeTemplate = pageTemplate("page/home.html")

func routeRobotsTxt(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(robots))
}

func routeServiceWorker(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "static/build/sw.js")
}

func routeHome(w http.ResponseWriter, r *http.Request) {
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

	renderTemplate(w, r, homeTemplate(), &pongo2.Context{
		"favoriteThings": favoriteThings,
		"projects":       projects,
	})
}
