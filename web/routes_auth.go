package web

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"time"
)

func AuthRoutes(router *mux.Router) {
	router.HandleFunc("/forms/login", func(w http.ResponseWriter, r *http.Request) {
		client := r.Context().Value("prisma_client").(*prisma.Client)

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
	}).Methods(http.MethodPost)

	router.HandleFunc("/forms/register", func(w http.ResponseWriter, r *http.Request) {
		client := r.Context().Value("prisma_client").(*prisma.Client)

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
}
