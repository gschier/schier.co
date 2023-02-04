package internal

import (
	"encoding/base64"
	"fmt"
	"github.com/Depado/bfchroma"
	"github.com/alecthomas/chroma/formatters/html"
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/markbates/pkger"
	"github.com/russross/blackfriday/v2"
	"io"
	"io/ioutil"
	"log"
	"math"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Use server start time as static cache key breaker
var staticBreaker = time.Now().Unix()
var deployTime = time.Now().Format(time.RFC3339)

var chroma = bfchroma.NewRenderer(
	bfchroma.WithoutAutodetect(),
	bfchroma.Extend(
		blackfriday.NewHTMLRenderer(blackfriday.HTMLRendererParameters{
			Flags: blackfriday.CommonHTMLFlags,
		}),
	),
	bfchroma.ChromaOptions(
		html.WithClasses(),
	),
)

var bfRenderer = blackfriday.WithRenderer(chroma)
var bfExtensions = blackfriday.WithExtensions(
	blackfriday.CommonExtensions |
		blackfriday.Footnotes |
		blackfriday.AutoHeadingIDs |
		blackfriday.NoEmptyLineBeforeBlock,
)

var pongo2Set = pongo2.NewSet("schier.co", pkgerLoader{})

func init() {
	pkger.Include("/templates")

	// pongo2.DefaultLoader
	err := pongo2.RegisterFilter(
		"isoformat",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			yearMonthDay := strings.SplitN(in.String(), " ", 2)[0]
			t, err := time.Parse("2006-01-02", yearMonthDay)
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}

			dateStr := t.Format("Jan _2, 2006")

			if param.String() != "" {
				dateStr = t.Format(param.String())
			} else if time.Now().Sub(t) < time.Hour*24 {
				// Use today for today
				dateStr = "Today"
			} else if time.Now().Sub(t) < time.Hour*24*200 {
				// Use short date if less than 200 days ago
				dateStr = t.Format("Jan _2")
			}

			return pongo2.AsValue(dateStr), nil
		},
	)
	if err != nil {
		panic("failed to register isoformat filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"iterate",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			l := make([]int, in.Integer())
			for _, i := range l {
				l[i] = i
			}
			return pongo2.AsValue(l), nil
		},
	)
	if err != nil {
		panic("failed to register iterate filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"isodate",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			yearMonthDay := strings.SplitN(in.String(), " ", 2)[0]
			t, err := time.Parse("2006-01-02", yearMonthDay)
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}

			return pongo2.AsValue(t), nil
		},
	)
	if err != nil {
		panic("failed to register isodate filter: " + err.Error())
	}

	re := regexp.MustCompile(`[^\w\s-–—:"'!?]`)
	err = pongo2.RegisterFilter(
		"sanitize",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			v := strings.TrimSpace(re.ReplaceAllString(in.String(), ""))
			return pongo2.AsValue(v), nil
		},
	)
	if err != nil {
		panic("failed to register isodate filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"isodatewithinmonth",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			first := strings.SplitN(in.String(), "-", 4)
			firstT, _ := time.Parse("2006-01-02", strings.Join(first[0:3], "-"))
			second := strings.SplitN(param.String(), "-", 4)
			secondT, _ := time.Parse("2006-01-02", strings.Join(second[0:3], "-"))
			days := firstT.Sub(secondT).Hours() / 24
			return pongo2.AsValue(math.Abs(days) < 30), nil
		},
	)
	if err != nil {
		panic("failed to register isodatesamemonth filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"contains",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(strings.Contains(in.String(), param.String())), nil
		},
	)
	if err != nil {
		panic("failed to register isodate filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"isodateolderdays",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			yearMonthDay := strings.SplitN(in.String(), " ", 2)[0]
			t, err := time.Parse("2006-01-02", yearMonthDay)
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}

			d := time.Now().Add(-time.Hour * 24 * time.Duration(param.Integer()))
			return pongo2.AsValue(t.Before(d)), nil
		},
	)
	if err != nil {
		panic("failed to register isodateolderdays filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"readtime",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(CalculateReadTime(in.Integer())), nil
		},
	)
	if err != nil {
		panic("failed to register isoformat filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"base64",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			b, err := readFile(path.Join(staticRoot, in.String()))
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}
			return pongo2.AsSafeValue(string(b)), nil
		},
	)
	if err != nil {
		panic("failed to register isoformat filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"inlinestatic",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			fullPath := path.Join(staticRoot, in.String())
			b, err := readFile(fullPath)
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}

			var finalValue string
			if param.String() == "base64" {
				finalValue = base64.StdEncoding.EncodeToString(b)
			} else {
				finalValue = string(b)
			}

			return pongo2.AsValue(finalValue), nil
		},
	)
	if err != nil {
		panic("failed to register inlinestatic filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"markdown",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			// BlackFriday doesn't like Windows line endings
			md := strings.Replace(in.String(), "\r\n", "\n", -1)

			return pongo2.AsSafeValue(RenderMarkdownStr(md)), nil
		},
	)
	if err != nil {
		panic("failed to register markdown filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"summary",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(Summary(in.String())), nil
		},
	)
	if err != nil {
		panic("failed to register summary filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"words",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsValue(WordCount(in.String())), nil
		},
	)
	if err != nil {
		panic("failed to register words filter: " + err.Error())
	}
}

var templateCache = make(map[string]*pongo2.Template)

func pageTemplate(pagePath string) *pongo2.Template {
	if cached, hit := templateCache[pagePath]; hit {
		return cached
	}

	tpl := pongo2.Must(pongo2Set.FromFile(filepath.Join("/templates/pages/", pagePath)))

	// Never cache in dev mode
	if !IsDevelopment() {
		templateCache[pagePath] = tpl
	}

	return tpl
}

func partialTemplate(partialPath string) *pongo2.Template {
	if cached, hit := templateCache[partialPath]; hit {
		return cached
	}

	tpl := pongo2.Must(pongo2Set.FromFile(filepath.Join("/templates/partials/", partialPath)))

	// Never cache in dev mode
	if !IsDevelopment() {
		templateCache[partialPath] = tpl
	}

	return tpl
}

func renderTemplate(w http.ResponseWriter, r *http.Request, template *pongo2.Template, context *pongo2.Context) {
	user := ctxGetUser(r)
	loggedIn := ctxGetLoggedIn(r)

	isDev := os.Getenv("DEV_ENVIRONMENT") == "development"

	// Update static breaker every request if we're on dev
	if isDev {
		staticBreaker = time.Now().Unix()
	}

	newContext := pongo2.Context{
		"csrfToken":        csrf.Token(r),
		"csrfTokenHeader":  "X-CSRF-Token",
		"deployTime":       deployTime,
		"doNotTrack":       loggedIn,
		"isDev":            isDev,
		"loggedIn":         loggedIn,
		"pageDescription":  "Thoughts on software and technology, by an independent software developer",
		"pageImage":        "",
		"pageImageDefault": os.Getenv("BASE_URL") + "/static/images/social/default.png",
		"pageTitle":        "",
		"pageUrl":          os.Getenv("BASE_URL") + r.URL.EscapedPath(),
		"rssUrl":           "/rss.xml",
		"staticUrl":        fmt.Sprintf("%s-%d", os.Getenv("STATIC_URL"), staticBreaker),
		"user":             user,
		csrf.TemplateTag:   csrf.TemplateField(r),
	}

	if context != nil {
		newContext = newContext.Update(*context)
	}

	err := template.ExecuteWriter(newContext, w)
	if err != nil {
		log.Println("Failed to render template", err)
		http.Error(w, "Failed to render", http.StatusInternalServerError)
		return
	}
}

func RenderMarkdown(md string) []byte {
	return blackfriday.Run([]byte(md), bfRenderer, bfExtensions)
}

func RenderMarkdownStr(md string) string {
	return string(RenderMarkdown(md))
}

// pkgerLoader implements pongo2.Loader in order to read templates
// from pkger instead of from the filesystem
type pkgerLoader struct{}

func (t pkgerLoader) Abs(_, name string) string {
	if filepath.IsAbs(name) {
		return name
	}
	abs := filepath.Join("/templates", name)
	return abs
}

func (t pkgerLoader) Get(path string) (io.Reader, error) {
	return pkger.Open(path)
}

func readFile(path string) ([]byte, error) {
	f, err := pkger.Open(path)
	if err != nil {
		return nil, err
	}

	b, err := ioutil.ReadAll(f)
	if err != nil {
		return nil, err
	}

	return b, nil
}
