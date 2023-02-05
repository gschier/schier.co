package internal

import (
	"fmt"
	"github.com/russross/blackfriday/v2"
	"io"
	"regexp"
	"strings"
)

const (
	htmlTag = "(?:" + openTag + "|" + closeTag + "|" + htmlComment + "|" +
		processingInstruction + "|" + declaration + "|" + cdata + ")"
	closeTag              = "</" + tagName + "\\s*[>]"
	openTag               = "<" + tagName + attribute + "*" + "\\s*/?>"
	attribute             = "(?:" + "\\s+" + attributeName + attributeValueSpec + "?)"
	attributeValue        = "(?:" + unquotedValue + "|" + singleQuotedValue + "|" + doubleQuotedValue + ")"
	attributeValueSpec    = "(?:" + "\\s*=" + "\\s*" + attributeValue + ")"
	attributeName         = "[a-zA-Z_:][a-zA-Z0-9:._-]*"
	cdata                 = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>"
	declaration           = "<![A-Z]+" + "\\s+[^>]*>"
	doubleQuotedValue     = "\"[^\"]*\""
	htmlComment           = "<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->"
	processingInstruction = "[<][?].*?[?][>]"
	singleQuotedValue     = "'[^']*'"
	tagName               = "[A-Za-z][A-Za-z0-9-]*"
	unquotedValue         = "[^\"'=<>`\\x00-\\x20]+"
)

var (
	nlBytes    = []byte{'\n'}
	gtBytes    = []byte{'>'}
	spaceBytes = []byte{' '}
)

var (
	h1Tag      = []byte("<h1")
	h1CloseTag = []byte("</h1>")
	h2Tag      = []byte("<h2")
	h2CloseTag = []byte("</h2>")
	h3Tag      = []byte("<h3")
	h3CloseTag = []byte("</h3>")
	h4Tag      = []byte("<h4")
	h4CloseTag = []byte("</h4>")
	h5Tag      = []byte("<h5")
	h5CloseTag = []byte("</h5>")
	h6Tag      = []byte("<h6")
	h6CloseTag = []byte("</h6>")
)

var (
	htmlTagRe = regexp.MustCompile("(?i)^" + htmlTag)
)

type Renderer struct {
	base *blackfriday.HTMLRenderer

	// Track heading IDs to prevent ID collision in a single generation.
	headingIDs map[string]int

	lastOutputLen int
	disableTags   int
}

func NewRenderer() blackfriday.Renderer {
	return &Renderer{
		headingIDs: map[string]int{},
		base: blackfriday.NewHTMLRenderer(blackfriday.HTMLRendererParameters{
			Flags: blackfriday.CommonHTMLFlags |
				blackfriday.HrefTargetBlank |
				blackfriday.NoopenerLinks,
			//blackfriday.TOC,
		}),
	}
}

func (r *Renderer) RenderNode(w io.Writer, node *blackfriday.Node, entering bool) blackfriday.WalkStatus {
	attrs := make([]string, 0)

	// Put any custom rendering logic here
	switch node.Type {
	case blackfriday.Heading:
		headingLevel := r.base.HTMLRendererParameters.HeadingLevelOffset + node.Level
		openTag, closeTag := headingTagsFromLevel(headingLevel)
		if entering {
			if node.IsTitleblock {
				attrs = append(attrs, `class="title"`)
			}
			if node.HeadingID != "" {
				id := node.HeadingID
				if r.base.HeadingIDPrefix != "" {
					id = r.base.HeadingIDPrefix + id
				}
				if r.base.HeadingIDSuffix != "" {
					id = id + r.base.HeadingIDSuffix
				}
				attrs = append(attrs, fmt.Sprintf(`id="%s"`, id))
			}
			r.cr(w)
			r.tag(w, openTag, attrs)
		} else {
			r.out(w, closeTag)
			if !(node.Parent.Type == blackfriday.Item && node.Next == nil) {
				r.cr(w)
			}
		}
	default:
		return r.base.RenderNode(w, node, entering)
	}

	return blackfriday.GoToNext
}

func (r *Renderer) RenderHeader(w io.Writer, ast *blackfriday.Node) {
	r.base.RenderHeader(w, ast)
}

func (r *Renderer) RenderFooter(w io.Writer, ast *blackfriday.Node) {
	r.base.RenderFooter(w, ast)
}

func (r *Renderer) out(w io.Writer, text []byte) {
	if r.disableTags > 0 {
		w.Write(htmlTagRe.ReplaceAll(text, []byte{}))
	} else {
		w.Write(text)
	}
	r.lastOutputLen = len(text)
}

func (r *Renderer) cr(w io.Writer) {
	if r.lastOutputLen > 0 {
		r.out(w, nlBytes)
	}
}

func headingTagsFromLevel(level int) ([]byte, []byte) {
	if level <= 1 {
		return h1Tag, h1CloseTag
	}
	switch level {
	case 2:
		return h2Tag, h2CloseTag
	case 3:
		return h3Tag, h3CloseTag
	case 4:
		return h4Tag, h4CloseTag
	case 5:
		return h5Tag, h5CloseTag
	}
	return h6Tag, h6CloseTag
}

func (r *Renderer) tag(w io.Writer, name []byte, attrs []string) {
	w.Write(name)
	if len(attrs) > 0 {
		w.Write(spaceBytes)
		w.Write([]byte(strings.Join(attrs, " ")))
	}
	w.Write(gtBytes)
	r.lastOutputLen = 1
}
