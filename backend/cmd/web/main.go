package main

import (
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/internal"
	"log"
	"net/http"
	"os"
)

func main() {
	db := internal.NewStorage()

	// Setup router
	router := setupRouter(db)

	handler := applyMiddleware(router)
	startServer(handler)
}

func setupRouter(db *internal.Storage) *mux.Router {
	router := mux.NewRouter()
	router.StrictSlash(true)

	// Route-specific middleware
	router.Use(internal.NewContextMiddleware(db))
	router.Use(internal.CSRFMiddleware)
	router.Use(internal.UserMiddleware)
	router.Use(internal.NewForceLoginHostMiddleware("schier.dev"))

	// Apply routes
	internal.NotFoundRoutes(router)
	internal.AuthRoutes(router)
	internal.BlogRoutes(router)
	internal.BooksRoutes(router)
	internal.PagesRoutes(router)
	internal.NewsletterRoutes(router)
	internal.StaticRoutes(router)

	return router
}

func applyMiddleware(r *mux.Router) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r

	// Global middleware
	handler = internal.CORSMiddleware(handler)
	handler = internal.DeployHeadersMiddleware(handler)
	handler = internal.CacheHeadersMiddleware(handler)
	handler = internal.LoggerMiddleware(handler)

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
