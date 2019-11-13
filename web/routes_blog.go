package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
)

func BlogRoutes(router *mux.Router) {
	router.HandleFunc("/blog", routeBlogList).Methods(http.MethodGet)
	//router.HandleFunc("/blog/{slug}", routeBlogList).Methods(http.MethodGet)
}

var blogListTemplate = pongo2.Must(pongo2.FromFile("templates/dynamic/blog_list.html"))

func routeBlogList(w http.ResponseWriter, r *http.Request) {
	client := ctxGetClient(r)
	user := ctxGetUser(r)
	loggedIn := ctxGetLoggedIn(r)

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputCreatedAtDesc
	blogPosts, err := client.BlogPosts(&prisma.BlogPostsParams{OrderBy: &orderBy}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	// Render template
	err = blogListTemplate.ExecuteWriter(pongo2.Context{
		"user":           user,
		"logged_in":      loggedIn,
		"blog_posts":     blogPosts,
		csrf.TemplateTag: csrf.TemplateField(r),
	}, w)
	if err != nil {
		log.Println("Failed to render blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}
}
