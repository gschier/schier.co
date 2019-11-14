package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"log"
	"net/http"
	"os"
)

func pageTemplate(pagePath string) *pongo2.Template {
	return pongo2.Must(pongo2.FromFile("templates/pages/" + pagePath))
}

func renderHandler(pagePath string, context *pongo2.Context) http.HandlerFunc {
	t := pageTemplate(pagePath)

	return func(w http.ResponseWriter, r *http.Request) {
		renderTemplate(w, r, t, context)
	}
}

func renderTemplate(w http.ResponseWriter, r *http.Request, template *pongo2.Template, context *pongo2.Context) {
	user := ctxGetUser(r)
	loggedIn := ctxGetLoggedIn(r)

	newContext := pongo2.Context{
		"user":           user,
		"loggedIn":       loggedIn,
		"staticUrl":      os.Getenv("STATIC_URL"),
		csrf.TemplateTag: csrf.TemplateField(r),
	}

	if context != nil {
		newContext = context.Update(newContext)
	}

	err := template.ExecuteWriter(newContext, w)
	if err != nil {
		log.Println("Failed to render template", err)
		http.Error(w, "Failed to render", http.StatusInternalServerError)
		return
	}
}
