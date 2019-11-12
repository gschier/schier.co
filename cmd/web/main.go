package main

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"log"
	"net/http"
	"os"
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
	router := setupRouter()
	handler := applyMiddleware(router)
	startServer(handler)
}

func applyMiddleware(r *mux.Router) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r

	handler = web.StaticMiddleware(handler)
	handler = web.PageMiddleware(handler, pages)
	handler = web.PrismaClientMiddleware(handler, client)
	handler = web.CSRFMiddleware(handler)
	handler = web.LoggerMiddleware(handler)

	return handler
}

func setupRouter() *mux.Router {
	router := mux.NewRouter()

	// Apply routes
	web.AuthRoutes(router)

	return router
}

func startServer(h http.Handler) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8258"
	}

	log.Println("Starting server on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, h))
}
