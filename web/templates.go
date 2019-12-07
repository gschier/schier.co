package web

import (
	"encoding/base64"
	"fmt"
	"github.com/Depado/bfchroma"
	"github.com/alecthomas/chroma/formatters/html"
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/russross/blackfriday/v2"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// Use server start time as static cache key breaker
var staticBreaker = time.Now().Unix()

var chroma = bfchroma.NewRenderer(
	bfchroma.WithoutAutodetect(),
	bfchroma.Extend(
		blackfriday.NewHTMLRenderer(blackfriday.HTMLRendererParameters{
			Flags:          blackfriday.CommonHTMLFlags,
			AbsolutePrefix: os.Getenv("STATIC_URL"),
		}),
	),
	bfchroma.ChromaOptions(
		html.ClassPrefix("chroma-"),
		html.WithClasses(),
	),
)

var bfRenderer = blackfriday.WithRenderer(chroma)
var bfExtensions = blackfriday.WithExtensions(
	blackfriday.CommonExtensions |
		blackfriday.AutoHeadingIDs |
		blackfriday.NoEmptyLineBeforeBlock,
)

func init() {
	err := pongo2.RegisterFilter(
		"isoformat",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			t, err := time.Parse(time.RFC3339, in.String())
			if err != nil {
				return nil, &pongo2.Error{OrigError: err}
			}

			return pongo2.AsValue(t.Format("January _2, 2006")), nil
		},
	)

	if err != nil {
		panic("failed to register isoformat filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"base64",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			b, err := ioutil.ReadFile("./static/build/" + in.String())
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
		"inlineStatic",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			b, err := ioutil.ReadFile("./static/build/" + in.String())
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
		panic("failed to register inlineStatic filter: " + err.Error())
	}

	err = pongo2.RegisterFilter(
		"markdown",
		func(in *pongo2.Value, param *pongo2.Value) (*pongo2.Value, *pongo2.Error) {
			return pongo2.AsSafeValue(RenderMarkdownStr(in.String())), nil
		},
	)

	if err != nil {
		panic("failed to register markdown filter: " + err.Error())
	}
}

func pageTemplate(pagePath string) func() *pongo2.Template {
	var cached *pongo2.Template = nil
	return func() *pongo2.Template {
		if cached == nil {
			cached = pongo2.Must(pongo2.FromFile("templates/pages/" + pagePath))
		}

		return cached
	}
}

func partialTemplate(partialPath string) func() *pongo2.Template {
	var cached *pongo2.Template = nil
	return func() *pongo2.Template {
		if cached == nil {
			cached = pongo2.Must(pongo2.FromFile("templates/partials/" + partialPath))
		}

		return cached
	}
}

func renderHandler(pagePath string, context *pongo2.Context) http.HandlerFunc {
	t := pageTemplate(pagePath)()

	return func(w http.ResponseWriter, r *http.Request) {
		renderTemplate(w, r, t, context)
	}
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
		"csrfToken":       csrf.Token(r),
		"csrfTokenHeader": "X-CSRF-Token",
		"defaultTitle":    "Greg Schier",
		"gaId":            os.Getenv("GA_ID"),
		"isDev":           isDev,
		"loggedIn":        loggedIn,
		"rssUrl":          os.Getenv("BASE_URL") + "/rss.xml",
		"staticUrl":       fmt.Sprintf("%s-%d", os.Getenv("STATIC_URL"), staticBreaker),
		"user":            user,
		csrf.TemplateTag:  csrf.TemplateField(r),
	}

	if context != nil {
		newContext = newContext.Update(*context)
	}

	// Minify slightly
	template.Options = &pongo2.Options{
		TrimBlocks:   true,
		LStripBlocks: true,
	}

	err := template.ExecuteWriter(newContext, w)
	if err != nil {
		log.Println("Failed to render template", err)
		http.Error(w, "Failed to render", http.StatusInternalServerError)
		return
	}
}

func RenderMarkdown(md string) []byte {
	// Blackfriday doesn't like Windows line endings
	md = strings.Replace(md, "\r\n", "\n", -1)

	return blackfriday.Run([]byte(md), bfRenderer, bfExtensions)
}

func RenderMarkdownStr(md string) string {
	return string(RenderMarkdown(md))
}
