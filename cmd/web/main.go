package main

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"log"
	"net/http"
	"os"
)

const pageRoot = "templates/pages"

func main() {
	router := setupRouter()

	handler := applyMiddleware(router, prisma.New(&prisma.Options{
		Endpoint: os.Getenv("PRISMA_ENDPOINT"),
		Secret:   os.Getenv("PRISMA_SECRET"),
	}))

	startServer(handler)
}

func applyMiddleware(r *mux.Router, pc *prisma.Client) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r

	handler = web.GenericPageMiddleware(handler, pageRoot)
	handler = web.UserMiddleware(handler)
	handler = web.StaticMiddleware(handler)
	handler = web.ContextMiddleware(handler, pc, r)
	//handler = web.CSRFMiddleware(handler)
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
