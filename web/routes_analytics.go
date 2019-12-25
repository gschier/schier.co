package web

import (
	"context"
	"encoding/json"
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/mileusna/useragent"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func AnalyticsRoutes(router *mux.Router) {
	router.HandleFunc("/t", routeTrack).Methods(http.MethodGet)
	router.HandleFunc("/analytics", routeAnalytics).Methods(http.MethodGet)
	router.HandleFunc("/analytics/live", routeAnalyticsLive).Methods(http.MethodGet)
}

var analyticsTemplate = pageTemplate("analytics/analytics.html")

func routeAnalyticsLive(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)
	now := time.Now()
	fiveMinutesAgo := now.Add(-time.Minute * 5).Format(time.RFC3339)
	views, err := client.AnalyticsPageViews(&prisma.AnalyticsPageViewsParams{
		Where: &prisma.AnalyticsPageViewWhereInput{
			TimeGte: &fiveMinutesAgo,
		},
	}).Exec(r.Context())
	if err != nil {
		http.Error(w, "Failed to query analytics", http.StatusInternalServerError)
		return
	}

	userMap := make(map[string]int)
	for _, view := range views {
		userMap[view.User] += 1
	}

	w.Header().Set("Content-Type", "application/json")
	j, _ := json.Marshal(struct{ Live int `json:"count"` }{Live: len(userMap)})
	_, _ = w.Write(j)
}

func routeAnalytics(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)

	now := time.Now()
	dateRange := time.Hour * 24 * 7
	dateBucketSize := time.Hour * 24

	views, err := client.AnalyticsPageViews(&prisma.AnalyticsPageViewsParams{
		Where: &prisma.AnalyticsPageViewWhereInput{
			TimeGte: prisma.Str(now.Add(dateRange * -1).Format(time.RFC3339)),
		},
	}).Exec(r.Context())
	if err != nil {
		http.Error(w, "Failed to query analytics", http.StatusInternalServerError)
		return
	}

	topPathCounters := make(map[string]int)
	topPlatformCounters := make(map[string]int)
	topBrowserCounters := make(map[string]int)
	pageViewCounters := make(map[int]int)
	userCounters := make(map[int]map[string]int)

	numBuckets := 0
	for _, view := range views {
		t, _ := time.Parse(time.RFC3339, view.Time)
		bucketIndex := int(now.Sub(t) / dateBucketSize)

		if bucketIndex > numBuckets {
			numBuckets = bucketIndex
		}

		userAgent := ua.Parse(view.UserAgent)
		if userAgent.Bot {
			continue
		}

		// Skip this one because it's weird
		if strings.HasPrefix(view.Path, "/analytics") {
			continue
		}

		// Increment page view
		pageViewCounters[bucketIndex] += 1

		// Add user ID
		if _, ok := userCounters[bucketIndex]; !ok {
			userCounters[bucketIndex] = make(map[string]int)
		}
		userCounters[bucketIndex][view.User] += 1

		topPlatformCounters[userAgent.OS] += 1
		topBrowserCounters[userAgent.Name] += 1

		// Add paths
		topPathCounters[view.Path] += 1
	}

	topPaths := make(counters, 0)
	for path, count := range topPathCounters {
		c := counter{Name: path, Count: count}
		topPaths = append(topPaths, c)
	}

	topBrowsers := make(counters, 0)
	for path, count := range topBrowserCounters {
		c := counter{Name: path, Count: count}
		topBrowsers = append(topBrowsers, c)
	}

	topPlatforms := make(counters, 0)
	for path, count := range topPlatformCounters {
		c := counter{Name: path, Count: count}
		topPlatforms = append(topPlatforms, c)
	}

	sort.Sort(topPaths)
	sort.Sort(topPlatforms)
	sort.Sort(topBrowsers)

	users := make([]int, numBuckets)
	pageViews := make([]int, numBuckets)
	for i := 0; i < numBuckets; i++ {
		pageViews[i] = pageViewCounters[numBuckets-i-1]
		users[i] = len(userCounters[numBuckets-i-1])
	}

	if len(topPaths) > 30 {
		topPaths = topPaths[0:30]
	}

	if len(topBrowsers) > 4 {
		topBrowsers = topBrowsers[0:4]
	}

	if len(topPlatforms) > 6 {
		topPlatforms = topPlatforms[0:6]
	}

	renderTemplate(w, r, analyticsTemplate(), &pongo2.Context{
		"pageViews":         pageViews,
		"users":             users,
		"topPaths":          topPaths,
		"topPlatforms":      topPlatforms,
		"topBrowsers":       topBrowsers,
		"bucketSizeSeconds": dateBucketSize / time.Second,
		"pageTitle":         "Analytics",
		"pageDescription":   "Public analytics for schier.co",
	})
}

type counter struct {
	Name  string
	Count int
}

type counters []counter

func (c counters) Len() int {
	return len(c)
}

func (c counters) Less(i, j int) bool {
	if c[i].Count == c[j].Count {
		return c[i].Name < c[j].Name
	}

	return c[i].Count > c[j].Count
}

func (c counters) Swap(i, j int) {
	c[i], c[j] = c[j], c[i]
}

func routeTrack(w http.ResponseWriter, r *http.Request) {
	// Don't track admins
	if ctxGetLoggedIn(r) {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	userAgent := r.Header.Get("User-Agent")
	parsedUA := ua.Parse(userAgent)

	// Don't track bots
	if parsedUA.Bot {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	q := r.URL.Query()
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
			UserAgent: userAgent,
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
