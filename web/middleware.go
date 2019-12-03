package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
)

const sessionCookieName = "sid"

// LogMiddleware logs each request
func LoggerMiddleware(next http.Handler) http.Handler {
	return handlers.LoggingHandler(os.Stdout, next)
}

// CompressMiddleware enables gzip for requests
func CompressMiddleware(next http.Handler) http.Handler {
	return handlers.CompressHandler(next)
}

// CacheMiddleware configures Cache-Control header
func CacheMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEV_ENVIRONMENT") == "development" {
			w.Header().Set("Cache-Control", "max-age=0")
		} else {
			w.Header().Set("Cache-Control", "max-age=60")
		}
		next.ServeHTTP(w, r)
	})
}

// ContextMiddleware adds useful things to the request context
func ContextMiddleware(next http.Handler, client *prisma.Client) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var emptyUser *prisma.User = nil

		r = ctxSetPrismaClient(r, client)
		r = ctxSetUserAndLoggedIn(r, emptyUser)

		next.ServeHTTP(w, r)
	})
}

// StaticMiddleware automatically serves static assets out of the static folder
func StaticMiddleware(next http.Handler) http.Handler {
	fileHandler := http.FileServer(http.Dir("."))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Shortcut to serve images out of static
		if strings.HasPrefix(r.URL.Path, "/images") {
			http.ServeFile(w, r, "./static"+r.URL.Path)
			return
		}

		// Serve everything else out of static
		if strings.HasPrefix(r.URL.Path, "/static") {
			fileHandler.ServeHTTP(w, r)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// CSRFMiddleware adds CSRF handling and protection to requests
func CSRFMiddleware(next http.Handler) http.Handler {
	return csrf.Protect(
		[]byte(os.Getenv("CSRF_KEY")),
		csrf.Secure(false),
		csrf.HttpOnly(true),
		csrf.Path("/"),
	)(next)
}

// UserMiddleware adds the User object to the context if available
func UserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client := ctxPrismaClient(r)

		c, err := r.Cookie(sessionCookieName)

		// No session header, not logged in I guess!
		if err != nil || c.Value == "" {
			next.ServeHTTP(w, r)
			return
		}

		http.SetCookie(w, makeCookie(c.Value))

		// Find the user on the session
		user, err := client.Session(prisma.SessionWhereUniqueInput{
			ID: &c.Value,
		}).User().Exec(r.Context())
		if err != nil {
			log.Println("No user found for session. Logging out", err.Error())
			logout(w, r, "/")
			return
		}

		// Add user to request context
		r = ctxSetUserAndLoggedIn(r, user)

		next.ServeHTTP(w, r)
	})
}

// pageMiddleware automatically serves pages defined here with the same base set of
// template data
func GenericPageMiddleware(next http.Handler, dir string) http.Handler {
	templates := map[string]*pongo2.Template{}

	entries, err := ioutil.ReadDir(dir)
	if err != nil {
		log.Fatalln("Failed to read pages directory", dir)
	}

	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".html") {
			continue
		}

		filePath := dir + "/" + e.Name()
		urlPath := "/" + strings.Replace(e.Name(), ".html", "", -1)

		if e.Name() == "index.html" {
			urlPath = "/"
		}

		templates[urlPath] = pongo2.Must(pongo2.FromFile(filePath))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if template, ok := templates[r.URL.Path]; ok {
			renderTemplate(w, r, template, nil)
			return
		}

		next.ServeHTTP(w, r)
	})
}