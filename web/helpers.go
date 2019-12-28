package web

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
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
	secondsLeft := seconds - minutes*60
	return fmt.Sprintf("%02.0f:%02.0f", minutes, secondsLeft)
}

func CapitalizeTitle(title string) string {
	lowerWords := map[string]int{
		"a":   1,
		"an":  1,
		"the": 1,
		"at":  1,
		"by":  1,
		"for": 1,
		"in":  1,
		"of":  1,
		"on":  1,
		"to":  1,
		"up":  1,
		"and": 1,
		"as":  1,
		"but": 1,
		"or":  1,
		"nor": 1,
	}

	wordCharRegexp := regexp.MustCompile(`\w`)
	words := strings.Fields(title)
	for i, w := range words {
		wLower := strings.ToLower(w)
		if _, shouldBeLower := lowerWords[wLower]; shouldBeLower {
			words[i] = wLower
			continue
		}


		first := w[0:1]
		rest := w[1:]

		// We need to check if we're upper-casing a word character because
		// `ToTitle()` can mangle things like emoji
		if wordCharRegexp.Match([]byte(first)) {
			first = strings.ToTitle(first)
		}

		words[i] = first + rest
	}

	return strings.Join(words, " ")
}
