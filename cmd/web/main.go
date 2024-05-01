package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"

	_ "github.com/gschier/schier.co/migrations"

	"github.com/gschier/schier.co/internal"
	"github.com/gschier/schier.co/internal/migrate"
)

func main() {
	db := internal.NewStorage()

	// Run migrations
	if os.Getenv("MIGRATE_ON_START") == "enable" {
		migrate.ForwardAll(context.Background(), db.Store.DB, true)
	}

	// Setup router
	router := setupRouter(db)
	handler := applyMiddleware(router)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8258"
	}

	host := os.Getenv("HOST")
	if host == "" {
		host = ""
	}

	fmt.Println("[schier.co] \033[32;1mStarted server on http://" + host + ":" + port + "\033[0m")
	log.Fatal(http.ListenAndServe(host+":"+port, handler))
}

func setupRouter(db *internal.Storage) *mux.Router {
	router := mux.NewRouter()
	router.StrictSlash(true)

	// Route-specific middleware
	router.Use(internal.NewContextMiddleware(db))
	router.Use(internal.CSRFMiddleware)
	router.Use(internal.UserMiddleware)

	// Apply routes
	internal.BaseRoutes(router)
	internal.AuthRoutes(router)
	internal.BlogRoutes(router)
	internal.NewsletterRoutes(router)

	return router
}

func applyMiddleware(r *mux.Router) http.Handler {
	// Apply global middleware. Note, we're doing it this way
	// because Gorilla doesn't apply middleware to 404
	var handler http.Handler = r
	var logger = internal.NewLogger("router")

	// Global middleware
	handler = internal.CORSMiddleware(handler)
	handler = internal.DeployHeadersMiddleware(handler)
	handler = internal.BlockUserAgentsMiddleware(handler, []string{"Go-http-client/2.0"})
	handler = internal.CacheHeadersMiddleware(handler)
	handler = internal.LoggingMiddleware(logger)(handler)

	return handler
}
