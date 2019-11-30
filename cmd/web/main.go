package main

import (
	"github.com/gorilla/mux"
	schier_dev "github.com/gschier/schier.dev"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"log"
	"net/http"
	"os"
)

const pageRoot = "templates/pages/generic"

func main() {
	client := schier_dev.NewPrismaClient()

	// Install fixtures
	schier_dev.InstallFixtures(client)

	// Setup router
	router := setupRouter()
	handler := applyMiddleware(router, client)
	startServer(handler)
}

func applyMiddleware(r *mux.Router, pc *prisma.Client) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r

	handler = web.GenericPageMiddleware(handler, pageRoot)
	handler = web.UserMiddleware(handler)
	handler = web.StaticMiddleware(handler)
	handler = web.ContextMiddleware(handler, pc)
	handler = web.CSRFMiddleware(handler)
	handler = web.CacheMiddleware(handler)
	handler = web.LoggerMiddleware(handler)
	handler = web.CompressMiddleware(handler)

	return handler
}

func setupRouter() *mux.Router {
	router := mux.NewRouter()
	router.StrictSlash(true)

	// Apply routes
	web.AuthRoutes(router)
	web.BlogRoutes(router)
	web.PagesRoutes(router)
	web.NotFoundRoutes(router)

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
