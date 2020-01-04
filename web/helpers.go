package web

import (
	"fmt"
	stripmd "github.com/writeas/go-strip-markdown"
	"math"
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

func ReadTime(words int) int {
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

func TagsToString(tags []string) string {
	for i, t := range tags {
		tags[i] = strings.ToLower(strings.TrimSpace(t))
	}

	return "|" + strings.Join(tags, "|") + "|"
}

func StringToTags(tags string) []string {
	tags = strings.TrimPrefix(tags, "|")
	tags = strings.TrimSuffix(tags, "|")

	allTags := regexp.MustCompile("[|,]").Split(tags, -1)
	for i, t := range allTags {
		allTags[i] = strings.ToLower(strings.TrimSpace(t))
	}

	return allTags
}

func TagsToComma(tags string) string {
	all := StringToTags(tags)
	return strings.Join(all, ", ")
}

func NormalizeTags(tags string) string {
	all := StringToTags(tags)
	return TagsToString(all)
}

func StrToInt(number string, defaultValue int) int {
	n, err := strconv.Atoi(number)
	if err != nil {
		return defaultValue
	}

	return n
}

func StrToInt32(number string, defaultValue int) int32 {
	return int32(StrToInt(number, defaultValue))
}

func IsDevelopment() bool {
	return os.Getenv("DEV_ENVIRONMENT") == "development"
}

// CalculateScore calculates a blog posts score. It sums votes and views,
// then divides by the age. The age is capped to 30 days so old posts don't
// go down to zero
func CalculateScore(age time.Duration, votes, views int32) int32 {
	days := float64(age / time.Hour / 24)
	score := float64(votes*200+views) / (math.Min(days, 90) + 1)

	return int32(score)
}
