package web

import (
	"github.com/gorilla/mux"
	"net/http"
)

func BlogRoutes(router *mux.Router) {
	router.HandleFunc("/blog/{slug}", routeBlogPost).Methods(http.MethodGet)
}

func routeBlogPost(w http.ResponseWriter, r *http.Request) {
}
