package web

import (
	"fmt"
	"math"
	"net/http"
)

func Admin(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := ctxGetUser(r)
		if user == nil {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte("Unauthorized"))
		} else {
			h.ServeHTTP(w, r)
		}
	}
}

func FormatTime(seconds float64) string {
	minutes := math.Floor(seconds / 60)
	secondsLeft := seconds - minutes * 60
	return fmt.Sprintf("%02.0f:%02.0f", minutes, secondsLeft)
}
