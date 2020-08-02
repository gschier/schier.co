package internal

import (
	"github.com/gorilla/mux"
	"github.com/markbates/pkger"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"
)

const staticRoot = "/frontend/static"

func init() {
	pkger.Include(staticRoot)
}

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
		fullPath := path.Join(staticRoot, "..", p)
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(r.URL.Path)))
		}
		b, err := readFile(fullPath)
		if err != nil {
			routeNotFound(w, r)
			return
		}
		_, _ = w.Write(b)
		return
	}

	http.NotFound(w, r)
}
