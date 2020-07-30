package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"
)

func AuthRoutes(router *mux.Router) {
	router.HandleFunc("/logout", routeLogout).Methods(http.MethodGet).Name("logout")

	// Forms
	router.HandleFunc("/login", routeLogin).Methods(http.MethodPost, http.MethodGet).Name("login")
	router.HandleFunc("/register", routeRegister).Methods(http.MethodPost, http.MethodGet).Name("register")
}

var loginTemplate = pageTemplate("auth/login.html")
var registerTemplate = pageTemplate("auth/register.html")

func routeLogout(w http.ResponseWriter, r *http.Request) {
	logout(w, r, "/")
}

func routeLogin(w http.ResponseWriter, r *http.Request) {
	render := func(email, password, error string) {
		renderTemplate(w, r, loginTemplate(), &pongo2.Context{
			"pageTitle":  "Login",
			"email":      email,
			"password":   password,
			"error":      error,
			"doNotTrack": true,
		})
	}

	if r.Method == http.MethodGet {
		render("", "", "")
		return
	}

	_ = r.ParseForm()

	password := r.Form.Get("password")
	email := r.Form.Get("email")

	db := ctxDB(r)

	user, err := db.UserByEmail(r.Context(), email)
	if err != nil {
		log.Println("Failed to get user to login", email, err)
		render(email, password, "Invalid username or password")
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		log.Println("Failed to match password for user", email, err)
		render(email, password, "Invalid username or password")
		return
	}

	login(w, r, user, db, "/")
}

func routeRegister(w http.ResponseWriter, r *http.Request) {
	render := func(email, name, password, error string) {
		renderTemplate(w, r, registerTemplate(), &pongo2.Context{
			"pageTitle":  "Register",
			"email":      email,
			"password":   password,
			"name":       name,
			"error":      error,
			"doNotTrack": true,
		})
	}

	if r.Method == http.MethodGet {
		render("", "", "", "")
		return
	}

	_ = r.ParseForm()
	email := r.Form.Get("email")
	name := r.Form.Get("name")
	password := r.Form.Get("password")

	if email == "" {
		render(email, name, password, "valid email required")
		return
	}

	if name == "" {
		render(email, name, password, "valid name required")
		return
	}

	if len(password) < 5 {
		render(email, name, password, "valid password required")
		return
	}

	if os.Getenv("DEV_ENVIRONMENT") != "development" {
		render(email, name, password, "registration disabled for non-dev environment")
	}

	db := ctxDB(r)

	// Generate password hash
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Println("Error generating user password", err.Error())
		render(email, name, password, "Error creating account")
		return
	}

	// Create user
	user, err := db.CreateUser(r.Context(), email, name, string(pwdHash))
	if err != nil {
		log.Println("Error creating user", err.Error())
		render(email, name, password, "Error creating account")
		return
	}

	login(w, r, user, db, "/")
}

func login(w http.ResponseWriter, r *http.Request, user *User, db *Storage, to string) {
	sid, err := db.CreateSession(r.Context(), user.ID)

	if err != nil {
		log.Println("Session creation failed", err.Error())
		http.Error(w, "Failed to login", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, makeCookie(sid))
	http.Redirect(w, r, to, http.StatusSeeOther)
}

func logout(w http.ResponseWriter, r *http.Request, to string) {
	http.SetCookie(w, &http.Cookie{
		Name:   sessionCookieName,
		Path:   "/",
		MaxAge: -1,
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
