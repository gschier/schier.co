package internal

import (
	"github.com/gorilla/mux"
	"net/http"
	"os"
	"path"
	"strings"
)

func StaticRoutes(router *mux.Router) {
	router.PathPrefix("/static/").HandlerFunc(routeStatic)
	router.PathPrefix("/static{cache}/").HandlerFunc(routeStatic)
	router.PathPrefix("/images/").HandlerFunc(routeStatic)
}

func routeStatic(w http.ResponseWriter, r *http.Request) {
	cache := mux.Vars(r)["cache"]
	p := strings.Replace(r.URL.Path, cache, "", 1)

	// Shortcut to serve images out of static
	if strings.HasPrefix(r.URL.Path, "/images") {
		http.ServeFile(w, r, path.Join(os.Getenv("STATIC_ROOT"), p))
		return
	}

	// Serve everything else out of static
	if strings.HasPrefix(r.URL.Path, "/static") {
		http.ServeFile(w, r, path.Join(".", p))
		return
	}

	http.NotFound(w, r)
}
