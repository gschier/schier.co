package web

import (
	"context"
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"net/http"
	"os"
	"strings"
)

// logMiddleware logs each request
func LoggerMiddleware(next http.Handler) http.Handler {
	return handlers.LoggingHandler(os.Stdout, next)
}

// prismaClientMiddleware adds the prisma client to the request context
func PrismaClientMiddleware(next http.Handler, client *prisma.Client) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		ctx = context.WithValue(ctx, "prisma_client", client)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// staticMiddleware automatically serves static assets out of the static folder
func StaticMiddleware(next http.Handler) http.Handler {
	fileHandler := http.FileServer(http.Dir("."))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/static") {
			fileHandler.ServeHTTP(w, r)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// pageMiddleware automatically serves pages defined here with the same base set of
// template data
func PageMiddleware(next http.Handler, templates map[string]*pongo2.Template) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		client := r.Context().Value("prisma_client").(*prisma.Client)
		name := ""

		if r.URL.Path != "/login" {
			c, err := r.Cookie("session")
			if err != nil {
				http.Redirect(w, r, "/login", http.StatusTemporaryRedirect)
				return
			}

			user, err := client.Session(prisma.SessionWhereUniqueInput{ID: &c.Value}).User().Exec(r.Context())
			if err != nil {
				http.Redirect(w, r, "/login", http.StatusTemporaryRedirect)
				return
			}
			name = user.Name
		}

		if template, ok := templates[r.URL.Path]; ok {
			err := template.ExecuteWriter(pongo2.Context{
				"name":           name,
				csrf.TemplateTag: csrf.TemplateField(r),
			}, w)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
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
