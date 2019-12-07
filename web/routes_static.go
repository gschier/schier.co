package web

import (
	"github.com/gorilla/mux"
	"net/http"
	"strings"
)

func StaticRoutes(router *mux.Router) {
	router.PathPrefix("/static/").HandlerFunc(routeStatic)
	router.PathPrefix("/static{cache}/").HandlerFunc(routeStatic)
	router.PathPrefix("/images/").HandlerFunc(routeStatic)
}

func routeStatic(w http.ResponseWriter, r *http.Request) {
	cache := mux.Vars(r)["cache"]
	path := strings.Replace(r.URL.Path, cache, "", 1)

	// Shortcut to serve images out of static
	if strings.HasPrefix(r.URL.Path, "/images") {
		http.ServeFile(w, r, "./static"+path)
		return
	}

	// Serve everything else out of static
	if strings.HasPrefix(r.URL.Path, "/static") {
		http.ServeFile(w, r, "."+path)
		return
	}

	routeNotFound(w, r)
}
