package web

import (
	"bytes"
	"fmt"
	"github.com/Depado/bfchroma"
	"github.com/alecthomas/chroma/formatters/html"
	"github.com/flosch/pongo2"
	"github.com/gorilla/csrf"
	"github.com/russross/blackfriday/v2"
	"github.com/satori/go.uuid"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

var staticCacheKey = strings.Replace(uuid.NewV4().String(), "-", "", -1)

var tagWhitespaceRegex = regexp.MustCompile(`(?m)^[\t ]+(.*)`)

type tagMarkdown struct {
	wrapper *pongo2.NodeWrapper
}

func (node *tagMarkdown) Execute(ctx *pongo2.ExecutionContext, writer pongo2.TemplateWriter) *pongo2.Error {
	b := bytes.NewBuffer(make([]byte, 0, 1024)) // 1 KiB

	// Disable escaping so we can inject HTML
	ctx = pongo2.NewChildExecutionContext(ctx)
	ctx.Autoescape = false

	pErr := node.wrapper.Execute(ctx, b)
	if pErr != nil {
		return pErr
	}

	// Remove leading whitespace
	md := tagWhitespaceRegex.ReplaceAllString(b.String(), "$1")
	fmt.Println(md)

	renderedContent := RenderMarkdown(md)
	_, err := writer.Write(renderedContent)
	if err != nil {
		return &pongo2.Error{OrigError: err}
	}

	return nil
}

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
		panic("failed to register template filter: " + err.Error())
	}

	err = pongo2.RegisterTag(
		"markdown",
		func(doc *pongo2.Parser, start *pongo2.Token, arguments *pongo2.Parser) (pongo2.INodeTag, *pongo2.Error) {
			wrapper, _, err := doc.WrapUntilTag("endmarkdown")
			if err != nil {
				return nil, err
			}
			node := &tagMarkdown{
				wrapper: wrapper,
			}

			return node, nil
		},
	)

	if err != nil {
		panic("failed to register template tag: " + err.Error())
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

	if os.Getenv("DEV_ENVIRONMENT") == "development" {
		staticCacheKey = strings.Replace(uuid.NewV4().String(), "-", "", -1)
	}

	newContext := pongo2.Context{
		"defaultTitle":    "Greg Schier",
		"user":            user,
		"loggedIn":        loggedIn,
		"staticUrl":       os.Getenv("STATIC_URL"),
		"staticCacheKey":  staticCacheKey,
		"csrfToken":       csrf.Token(r),
		"csrfTokenHeader": "X-CSRF-Token",
		csrf.TemplateTag:  csrf.TemplateField(r),
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
	chroma := bfchroma.NewRenderer(
		bfchroma.WithoutAutodetect(),
		bfchroma.Extend(blackfriday.NewHTMLRenderer(blackfriday.HTMLRendererParameters{
			AbsolutePrefix: os.Getenv("STATIC_URL"),
			//FootnoteAnchorPrefix:       "",
			//FootnoteReturnLinkContents: "",
			//HeadingIDPrefix:            "",
			//HeadingIDSuffix:            "",
			//HeadingLevelOffset:         0,
			//Title:                      "",
			//CSS:                        "",
			//Icon:                       "",
			Flags: blackfriday.CommonHTMLFlags,
		})),
		bfchroma.ChromaOptions(
			html.ClassPrefix("chroma-"),
			html.WithClasses(),
		),
	)

	return blackfriday.Run([]byte(md), blackfriday.WithRenderer(chroma))
}

func RenderMarkdownStr(md string) string {
	return string(RenderMarkdown(md))
}
