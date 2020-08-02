package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"

	// Import root, where pkger.go will be
	_ "github.com/gschier/schier.co"

	"github.com/gschier/schier.co/internal"
	"github.com/gschier/schier.co/internal/migrate"
	"github.com/gschier/schier.co/migrations"
)

func main() {
	db := internal.NewStorage()

	// Run migrations
	if os.Getenv("MIGRATE_ON_START") == "enable" {
		migrate.ForwardAll(context.Background(), migrations.All(), db.DB(), true)
	}

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

	// Apply routes
	internal.MiscRoutes(router)
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
