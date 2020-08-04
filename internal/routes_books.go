package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"net/http"
)

func BooksRoutes(router *mux.Router) {
	// RSS
	router.HandleFunc("/books", routeBooks).Methods(http.MethodGet)
}

var booksTemplate = pageTemplate("page/books.html")

func routeBooks(w http.ResponseWriter, r *http.Request) {
	renderTemplate(w, r, booksTemplate(), &pongo2.Context{
		"pageTitle": "Books",
	})
}
