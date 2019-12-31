package web

import (
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
	"os"
	"regexp"
	"time"
)

const sessionCookieName = "sid"

var cachedPaths = regexp.MustCompile("\\.(png|svg|jpg|jpeg|js|css)$")

type writer struct {
	wOG                      http.ResponseWriter
	defaultHeaders           http.Header
	hasWrittenDefaultHeaders bool
}

func (w *writer) SetDefaultHeader(n, v string) {
	w.Header().Set(n, v)
}

func (w *writer) Header() http.Header {
	return w.defaultHeaders
}

func (w *writer) Write(b []byte) (int, error) {
	w.tryWriteDefaultHeaders()
	return w.wOG.Write(b)
}

func (w *writer) WriteHeader(status int) {
	w.tryWriteDefaultHeaders()
	w.wOG.WriteHeader(status)
}

func (w *writer) tryWriteDefaultHeaders() {
	if w.hasWrittenDefaultHeaders {
		return
	}

	w.hasWrittenDefaultHeaders = true

	for name, values := range w.defaultHeaders {
		for _, value := range values {
			w.wOG.Header().Set(name, value)
		}
	}
}

// LogMiddleware logs each request
func LoggerMiddleware(next http.Handler) http.Handler {
	return handlers.LoggingHandler(os.Stdout, next)
}

// DeployMiddleware adds deploy time as a header to all responses
func DeployHeadersMiddleware(next http.Handler) http.Handler {
	var deploy = time.Now().Format(time.RFC3339)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wNew := &writer{wOG: w, defaultHeaders: http.Header{}}
		wNew.SetDefaultHeader("X-Deploy", deploy)
		next.ServeHTTP(wNew, r)
	})
}

// CacheHeadersMiddleware configures Cache-Control header
func CacheHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wNew := &writer{wOG: w, defaultHeaders: http.Header{}}
		shouldCache := true
		shouldCache = shouldCache && cachedPaths.MatchString(r.URL.Path)
		shouldCache = shouldCache && os.Getenv("DEV_ENVIRONMENT") != "development"

		if shouldCache {
			wNew.SetDefaultHeader("Cache-Control", "public, max-age=7200, must-revalidate")
		} else {
			// https://stackoverflow.com/questions/49547/how-do-we-control-web-page-caching-across-all-browsers/2068407#2068407
			wNew.SetDefaultHeader("Cache-Control", "no-store, must-revalidate")
			wNew.SetDefaultHeader("Expires", "0")
			wNew.SetDefaultHeader("Vary", "Cookie")
		}

		next.ServeHTTP(wNew, r)
	})
}

// CSRFMiddleware adds CSRF handling and protection to requests
func CSRFMiddleware(next http.Handler) http.Handler {
	return csrf.Protect(
		[]byte(os.Getenv("CSRF_KEY")),
		csrf.MaxAge(3600 * 24 * 7),
		csrf.Secure(false),
		csrf.HttpOnly(true),
		csrf.Path("/"),
	)(next)
}

// CORSMiddleware adds CORS headers to the requests
func CORSMiddleware(next http.Handler) http.Handler {
	return handlers.CORS(handlers.AllowedOrigins([]string{
		"https://schier.co",
		"https://schier.dev",
	}))(next)
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

// NewForceLoginHostMiddleware adds useful things to the request context
func NewForceLoginHostMiddleware(host string) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			loggedIn := ctxGetLoggedIn(r)

			if host == r.Host && !loggedIn && r.URL.Path != "/login" {
				http.Redirect(w, r, "/login", http.StatusFound)
			}

			next.ServeHTTP(w, r)
		})
	}
}

// ContextMiddleware adds useful things to the request context
func NewContextMiddleware(client *prisma.Client) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var emptyUser *prisma.User = nil

			r = ctxSetPrismaClient(r, client)
			r = ctxSetUserAndLoggedIn(r, emptyUser)

			next.ServeHTTP(w, r)
		})
	}
}
