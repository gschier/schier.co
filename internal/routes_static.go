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

	// Serve everything else out of static
	if strings.HasPrefix(r.URL.Path, "/static") {
		// Here, we go up a directory, to remove /static/static/...
		fullPath := path.Join(os.Getenv("STATIC_ROOT"), "..", p)
		http.ServeFile(w, r, fullPath)
		return
	}

	http.NotFound(w, r)
}
