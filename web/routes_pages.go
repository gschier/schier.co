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

func routeRobotsTxt(w http.ResponseWriter, r *http.Request) {
	if r.Host == "schier.co" {
		_, _ = w.Write([]byte(robots))
	} else {
		_, _ = w.Write([]byte(robotsNone))
	}
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

	blogPostsOrderBy := prisma.BlogPostOrderByInputDateDesc
	blogPosts, err := client.BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Published: prisma.Bool(true),
			DateGt:    prisma.Str("2017-01-01"),
		},
		First:   prisma.Int32(5),
		OrderBy: &blogPostsOrderBy,
	},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog posts: " + err.Error())
		http.Error(w, "Failed to fetch blog posts", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, homeTemplate(), &pongo2.Context{
		"favoriteThings": favoriteThings,
		"projects":       projects,
		"blogPosts":      blogPosts,
	})
}
