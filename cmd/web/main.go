package main

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

var pages = map[string]*pongo2.Template{
	"/":         pongo2.Must(pongo2.FromFile("pongo2/pages/index.html")),
	"/about":    pongo2.Must(pongo2.FromFile("pongo2/pages/about.html")),
	"/register": pongo2.Must(pongo2.FromFile("pongo2/pages/register.html")),
	"/login":    pongo2.Must(pongo2.FromFile("pongo2/pages/login.html")),
}

var client = prisma.New(&prisma.Options{
	Endpoint: os.Getenv("PRISMA_ENDPOINT"),
	Secret:   os.Getenv("PRISMA_SECRET"),
})

func main() {
	r := mux.NewRouter()

	r.HandleFunc("/forms/register", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		password := r.Form.Get("password")
		email := r.Form.Get("email")
		name := r.Form.Get("name")

		// Generate password hash
		pwdHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Create user
		_, err = client.CreateUser(prisma.UserCreateInput{
			Email:        email,
			Name:         name,
			PasswordHash: string(pwdHash),
		}).Exec(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
	})

	r.HandleFunc("/forms/login", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		password := r.Form.Get("password")
		email := r.Form.Get("email")

		user, err := client.User(prisma.UserWhereUniqueInput{
			Email: &email,
		}).Exec(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		session, err := client.CreateSession(prisma.SessionCreateInput{
			User: prisma.UserCreateOneInput{
				Connect: &prisma.UserWhereUniqueInput{ID: &user.ID},
			},
			LastUsed: time.Now().Format(time.RFC3339),
		}).Exec(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Path:     "/",
			Value:    session.ID,
			Secure:   false,
			HttpOnly: true,
			SameSite: http.SameSiteDefaultMode,
		})

		http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
	})

	// Serve static files
	r.PathPrefix("/public").Handler(http.FileServer(http.Dir("."))).Methods(http.MethodGet)

	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r
	handler = staticMiddleware(handler)
	handler = pageMiddleware(handler, pages)
	handler = csrfMiddleware(handler)
	handler = logMiddleware(handler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8258"
	}

	log.Println("Starting server on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

// logMiddleware logs each request
func logMiddleware(next http.Handler) http.Handler {
	return handlers.LoggingHandler(os.Stdout, next)
}

// staticMiddleware automatically serves static assets out of the static folder
func staticMiddleware(next http.Handler) http.Handler {
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
func pageMiddleware(next http.Handler, templates map[string]*pongo2.Template) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

func csrfMiddleware(next http.Handler) http.Handler {
	return csrf.Protect(
		[]byte("08SY058118B4DN7adZr5a77Omvp6v1vA"),
		csrf.FieldName("csrf_token"),
		csrf.Secure(false),
		csrf.HttpOnly(true),
		csrf.Path("/"),
		csrf.MaxAge(12000),
	)(next)
}
