package internal

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"
	"log"
	"net/http"
	"os"

	"github.com/gschier/schier.co/internal/db"
)

func AuthRoutes(router *mux.Router) {
	router.HandleFunc("/logout", routeLogout).Methods(http.MethodGet).Name("logout")
	router.HandleFunc("/login", routeLogin).Methods(http.MethodPost, http.MethodGet).Name("login")
	router.HandleFunc("/register", routeRegister).Methods(http.MethodPost, http.MethodGet).Name("register")
}

func routeLogout(w http.ResponseWriter, r *http.Request) {
	logout(w, r, "/")
}

func routeLogin(w http.ResponseWriter, r *http.Request) {
	render := func(email, password, error string) {
		renderTemplate(w, r, pageTemplate("auth/login.html"), &pongo2.Context{
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

	user, err := ctxDB(r).Store.Users.Filter(gen.Where.User.Email.Eq(email)).One()
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

	login(w, r, user, ctxDB(r), "/")
}

func routeRegister(w http.ResponseWriter, r *http.Request) {
	render := func(email, name, password, error string) {
		renderTemplate(w, r, pageTemplate("auth/register.html"), &pongo2.Context{
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

	// Generate password hash
	pwdHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Println("Error generating user password", err.Error())
		render(email, name, password, "Error creating account")
		return
	}

	// Create user
	user, err := ctxDB(r).Store.Users.Insert(
		gen.Set.User.Email(email),
		gen.Set.User.Name(name),
		gen.Set.User.PasswordHash(string(pwdHash)),
	)
	if err != nil {
		log.Println("Error creating user", err.Error())
		render(email, name, password, "Error creating account")
		return
	}

	login(w, r, user, ctxDB(r), "/")
}

func login(w http.ResponseWriter, r *http.Request, user *gen.User, db *Storage, to string) {
	sess, err := db.Store.Sessions.Insert(
		gen.Set.Session.UserID(user.ID),
	)

	if err != nil {
		log.Println("Session creation failed", err.Error())
		http.Error(w, "Failed to login", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, makeCookie(sess.ID))
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
