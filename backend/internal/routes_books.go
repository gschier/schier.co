package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"log"
	"net/http"
)

func BooksRoutes(router *mux.Router) {
	// RSS
	router.HandleFunc("/books", routeBooks).Methods(http.MethodGet)
}

var booksTemplate = pageTemplate("page/books.html")

func routeBooks(w http.ResponseWriter, r *http.Request) {
	// Fetch blog posts
	books, err := ctxDB(r).RankedBooks(r.Context())
	if err != nil {
		log.Println("Failed to load books", err)
		http.Error(w, "Failed to load books", http.StatusInternalServerError)
		return
	}

	// Render template
	renderTemplate(w, r, booksTemplate(), &pongo2.Context{
		"books":     books,
		"pageTitle": "Books",
	})
}
