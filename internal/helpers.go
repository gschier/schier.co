package internal

import (
	stripmd "github.com/writeas/go-strip-markdown"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
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

func HttpErrorBadRequest(w http.ResponseWriter, msg string, err error) {
	HttpError(w, msg, err, http.StatusBadRequest)
}

func HttpErrorInternal(w http.ResponseWriter, msg string, err error) {
	HttpError(w, msg, err, http.StatusInternalServerError)
}

func HttpError(w http.ResponseWriter, msg string, err error, status int) {
	if err != nil {
		log.Println(msg, err.Error())
		http.Error(w, msg, status)
	} else {
		log.Println(msg)
		http.Error(w, msg, status)
	}
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
	isFirstWord := true
	for i, w := range words {
		wLower := strings.ToLower(w)
		if _, shouldBeLower := lowerWords[wLower]; !isFirstWord && shouldBeLower {
			words[i] = wLower
			continue
		}

		first := w[0:1]
		rest := w[1:]

		// We need to check if we're upper-casing a word character because
		// `ToTitle()` can mangle things like emoji
		if wordCharRegexp.Match([]byte(first)) {
			first = strings.ToTitle(first)
			isFirstWord = false
		}

		words[i] = first + rest
	}

	return strings.Join(words, " ")
}

func WordCount(md string) int {
	return strings.Count(stripmd.Strip(md), " ")
}

func CalculateReadTime(words int) int {
	return int(float64(words)/200) + 1
}

var reNewlines = regexp.MustCompile(`\n+`)

func Summary(md string) string {
	md = strings.Replace(md, "\r\n", "\n", -1)

	var summaryMD string
	if strings.Contains(md, "<!--more-->") {
		summaryMD = strings.Split(md, "<!--more-->")[0]
	} else {
		// Take the first paragraph if no <!--more-->
		summaryMD = strings.Split(md, "\n\n")[0]
	}

	summary := stripmd.Strip(summaryMD)

	// Replace some other things
	summary = reNewlines.ReplaceAllString(summary, " ")
	summary = strings.Replace(summary, "---", "—", -1)
	summary = strings.Replace(summary, "--", "–", -1)

	return strings.TrimSpace(summary)
}

func StringToTags(tags string) []string {
	allTags := regexp.MustCompile("[|,]").Split(tags, -1)
	finalTags := make([]string, 0)
	for _, t := range allTags {
		tag := strings.ToLower(strings.TrimSpace(t))
		if tag == "" {
			continue
		}
		finalTags = append(finalTags, tag)
	}

	return finalTags
}

func StrToInt(number string, defaultValue int) int {
	n, err := strconv.Atoi(number)
	if err != nil {
		return defaultValue
	}

	return n
}

func StrToInt64(number string, defaultValue int64) int64 {
	n, err := strconv.Atoi(number)
	if err != nil {
		return defaultValue
	}

	return int64(n)
}

func IsDevelopment() bool {
	return os.Getenv("DEV_ENVIRONMENT") == "development"
}

// CalculateScore calculates a blog posts score. It sums votes and views,
// then divides by the age.
func CalculateScore(age time.Duration, votes, views int64, words int) int64 {
	days := float64(age / time.Hour / 24)

	// New posts on fire!
	if days < 1 {
		return 999999
	}

	// Hide old posts
	if days > 365 {
		return 0
	}

	score := float64(votes*400+views) / (days + 1)

	if words < 200 {
		score /= 2
	}

	return int64(score)
}
