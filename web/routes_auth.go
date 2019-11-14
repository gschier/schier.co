package web

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
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
	_ = r.ParseForm()

	password := r.Form.Get("password")
	email := r.Form.Get("email")

	client := ctxGetClient(r)

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
	client := ctxGetClient(r)

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
	}).Exec(r.Context())

	if err != nil {
		log.Println("Session creation failed", err.Error())
		http.Error(w, "Failed to login", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, makeCookie(session.ID))
	http.Redirect(w, r, to, http.StatusSeeOther)
}

func logout(w http.ResponseWriter, r *http.Request, to string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Path:     "/",
		MaxAge:  -1,
	})
	http.Redirect(w, r, to, http.StatusSeeOther)
}

func makeCookie(sessionID string) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Path:     "/",
		Value:    sessionID,
		MaxAge:   60 * 60 * 24 * 7,
		Secure:   false,
		HttpOnly: true,
		SameSite: http.SameSiteDefaultMode,
	}
}
