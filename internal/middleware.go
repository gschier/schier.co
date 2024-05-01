package internal

import (
	"fmt"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"log"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"runtime/debug"
	"time"

	"github.com/gschier/schier.co/internal/db"
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

// DeployHeadersMiddleware adds deploy time as a header to all responses
func DeployHeadersMiddleware(next http.Handler) http.Handler {
	var deploy = time.Now().Format(time.RFC3339)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wNew := &writer{wOG: w, defaultHeaders: http.Header{}}
		wNew.SetDefaultHeader("X-Deploy", deploy)
		next.ServeHTTP(wNew, r)
	})
}

// BlockUserAgentsMiddleware blocks a blacklist of unwanted user agents from accessing the page
func BlockUserAgentsMiddleware(next http.Handler, userAgents []string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, ua := range userAgents {
			if r.Header.Get("User-Agent") == ua {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		next.ServeHTTP(w, r)
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
		csrf.MaxAge(3600*24*7),
		csrf.Secure(false),
		csrf.HttpOnly(true),
		csrf.Path("/"),
	)(next)
}

// CORSMiddleware adds CORS headers to the requests
func CORSMiddleware(next http.Handler) http.Handler {
	return handlers.CORS(handlers.AllowedOrigins([]string{
		"https://schier.co",
	}))(next)
}

// UserMiddleware adds the User object to the context if available
func UserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookieName)

		// No session header, not logged in I guess!
		if err != nil || c.Value == "" {
			next.ServeHTTP(w, r)
			return
		}

		http.SetCookie(w, makeCookie(c.Value))

		// Find the user on the session
		session, err := ctxDB(r).Store.Sessions.Get(c.Value)
		if err != nil {
			log.Println("No session found for ID", c.Value, err.Error())
			logout(w, r, "/")
			return
		}

		user, err := ctxDB(r).Store.Users.Get(session.UserID)
		if err != nil {
			log.Println("No user found for ID", session.UserID, err.Error())
			logout(w, r, "/")
			return
		}

		// Add user to request context
		r = ctxSetUserAndLoggedIn(r, user)

		next.ServeHTTP(w, r)
	})
}

// ContextMiddleware adds useful things to the request context
func NewContextMiddleware(db *Storage) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var emptyUser *gen.User = nil

			r = ctxSetDB(r, db)
			r = ctxSetUserAndLoggedIn(r, emptyUser)

			next.ServeHTTP(w, r)
		})
	}
}

// responseWriter is a minimal wrapper for http.ResponseWriter that allows the
// written HTTP status code to be captured for logging.
type responseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func wrapResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w}
}

func (rw *responseWriter) Status() int {
	return rw.status
}

func (rw *responseWriter) WriteHeader(code int) {
	if rw.wroteHeader {
		return
	}

	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
	rw.wroteHeader = true

	return
}

// LoggingMiddleware logs the incoming HTTP request & its duration.
func LoggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					w.WriteHeader(http.StatusInternalServerError)
					logger.Error(
						fmt.Sprintf("%s\n%s", err, debug.Stack()),
					)
				}
			}()

			start := time.Now()
			wrapped := wrapResponseWriter(w)
			next.ServeHTTP(wrapped, r)
			fn := logger.Info
			if wrapped.status >= 500 {
				fn = logger.Error
			} else if wrapped.status >= 400 {
				fn = logger.Warn
			} else if wrapped.status >= 300 {
				fn = logger.Debug
			} else if wrapped.status >= 200 {
				fn = logger.Info
			} else {
				fn = logger.Debug
			}

			status := wrapped.status
			if status == 0 {
				status = 200
			}

			fn(
				"Request completed to "+r.URL.EscapedPath(),
				"status", status,
				"method", r.Method,
				"headers", r.Header,
				"addr", r.RemoteAddr,
				"path", r.URL.EscapedPath(),
				"duration", time.Since(start).String(),
				"host", r.Host,
			)
		}

		return http.HandlerFunc(fn)
	}
}
