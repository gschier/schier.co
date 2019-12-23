package web

import "net/http"

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
