package web

import (
	"context"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
	"strconv"
)

func AnalyticsRoutes(router *mux.Router) {
	router.HandleFunc("/t", routeTrack).Methods(http.MethodGet)
}

func routeTrack(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	ua := r.Header.Get("User-Agent")
	path := q.Get("path")
	search := q.Get("search")
	ref := q.Get("ref")
	sess := q.Get("sess")
	user := q.Get("user")
	ageStr := q.Get("age")

	age, _ := strconv.Atoi(ageStr)

	go func() {
		client := ctxPrismaClient(r)
		_, err := client.CreateAnalyticsPageView(prisma.AnalyticsPageViewCreateInput{
			UserAgent: ua,
			Path:      path,
			Search:    search,
			Referrer:  ref,
			Sess:      sess,
			User:      user,
			Age:       int32(age),
		}).Exec(context.Background())
		if err != nil {
			log.Println("Failed to update analytics", err.Error())
		}
	}()

	w.WriteHeader(http.StatusNoContent)
}
