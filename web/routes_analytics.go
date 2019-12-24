package web

import (
	"context"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
	"strconv"
	"time"
)

func AnalyticsRoutes(router *mux.Router) {
	router.HandleFunc("/t", routeTrack).Methods(http.MethodGet)
	router.HandleFunc("/analytics", Admin(routeAnalytics)).Methods(http.MethodGet)
}

var analyticsTemplate = pageTemplate("analytics/analytics.html")

func routeAnalytics(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)

	now := time.Now()
	sevenDaysAgo := now.Add(-time.Hour * 24 * 7).Format(time.RFC3339)
	orderBy := prisma.AnalyticsPageViewOrderByInputTimeDesc

	views, err := client.AnalyticsPageViews(&prisma.AnalyticsPageViewsParams{
		Where: &prisma.AnalyticsPageViewWhereInput{
			TimeGte: &sevenDaysAgo,
		},
		OrderBy: &orderBy,
	}).Exec(r.Context())
	if err != nil {
		http.Error(w, "Failed to query analytics", http.StatusInternalServerError)
		return
	}

	pageViewCounters := make(map[int]int)
	userCounters := make(map[int]map[string]int)
	for _, view := range views {
		t, _ := time.Parse(time.RFC3339, view.Time)
		day := int(now.Sub(t).Hours() / 24)

		// Increment page view
		pageViewCounters[day] += 1

		// Add user ID
		if _, ok := userCounters[day]; !ok {
			userCounters[day] = make(map[string]int)
		}
		userCounters[day][view.User] += 1
	}

	users := make([]int, 0)
	pageViews := make([]int, 0)
	for i := 6; i >= 0; i-- {
		pageViews = append(pageViews, pageViewCounters[i])
		users = append(users, len(userCounters[i]))
	}

	renderTemplate(w, r, analyticsTemplate(), &pongo2.Context{
		"pageViews": pageViews,
		"users": users,
	})
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
