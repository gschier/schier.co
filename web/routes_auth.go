package web

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"time"
)

func AuthRoutes(router *mux.Router) {
	router.HandleFunc("/logout", routeLogout).Methods(http.MethodGet).Name("logout")

	// Forms
	router.HandleFunc("/forms/login", routeLogin).Methods(http.MethodPost).Name("login")
	router.HandleFunc("/forms/register", routeRegister).Methods(http.MethodPost).Name("register")
}

func routeLogout(w http.ResponseWriter, r *http.Request) {
	logout(w, r, "/")
}

func routeLogin(w http.ResponseWriter, r *http.Request) {
	client := r.Context().Value("prisma_client").(*prisma.Client)

	_ = r.ParseForm()
	password := r.Form.Get("password")
	email := r.Form.Get("email")

	user, err := client.User(prisma.UserWhereUniqueInput{
		Email: &email,
	}).Exec(r.Context())
	if err != nil {
		log.Println("User fetch failed", err.Error())
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte("Bad username/password"))
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		log.Println("Bcrypt login failed", err.Error())
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte("Bad username/password"))
		return
	}

	login(w, r, user, client, "/")
}

func routeRegister(w http.ResponseWriter, r *http.Request) {
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
	user, err := client.CreateUser(prisma.UserCreateInput{
		Email:        email,
		Name:         name,
		PasswordHash: string(pwdHash),
	}).Exec(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	login(w, r, user, client, "/")
}

func login(w http.ResponseWriter, r *http.Request, user *prisma.User, client *prisma.Client, to string) {
	session, err := client.CreateSession(prisma.SessionCreateInput{
		User: prisma.UserCreateOneInput{
			Connect: &prisma.UserWhereUniqueInput{ID: &user.ID},
		},
		LastUsed: time.Now().Format(time.RFC3339),
	}).Exec(r.Context())

	if err != nil {
		log.Println("Session creation failed", err.Error())
		http.Error(w, "Failed to login", http.StatusInternalServerError)
		return
	}
	log.Println("CREATED SESSION!", session.ID)
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Path:     "/",
		Value:    session.ID,
		Secure:   false,
		HttpOnly: true,
		SameSite: http.SameSiteDefaultMode,
	})

	http.Redirect(w, r, to, http.StatusTemporaryRedirect)
}

func logout(w http.ResponseWriter, r *http.Request, to string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
	})
	http.Redirect(w, r, to, http.StatusTemporaryRedirect)
}
