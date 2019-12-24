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

func main() {
	client := schier_dev.NewPrismaClient()

	// Setup router
	router := setupRouter(client)

	handler := applyMiddleware(router)
	startServer(handler)
}

func setupRouter(client *prisma.Client) *mux.Router {
	router := mux.NewRouter()
	router.StrictSlash(true)

	// Route-specific middleware
	router.Use(web.NewContextMiddleware(client))
	router.Use(web.CSRFMiddleware)
	router.Use(web.UserMiddleware)
	router.Use(web.NewForceLoginHostMiddleware("schier.dev"))

	// Apply routes
	web.NotFoundRoutes(router)
	web.AuthRoutes(router)
	web.BlogRoutes(router)
	web.BooksRoutes(router)
	web.PagesRoutes(router)
	web.NewsletterRoutes(router)
	web.AnalyticsRoutes(router)
	web.StaticRoutes(router)

	return router
}

func applyMiddleware(r *mux.Router) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r

	// Global middleware
	handler = web.DeployHeadersMiddleware(handler)
	handler = web.CacheHeadersMiddleware(handler)
	handler = web.LoggerMiddleware(handler)

	return handler
}

func startServer(h http.Handler) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8258"
	}

	log.Println("Starting server on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, h))
}
