package internal

import (
	"github.com/russross/blackfriday/v2"
	"io"
)

type Renderer struct {
	base          *blackfriday.HTMLRenderer
	disableTags   int
	lastOutputLen int
}

func NewRenderer() blackfriday.Renderer {
	return &Renderer{
		base: blackfriday.NewHTMLRenderer(blackfriday.HTMLRendererParameters{
			Flags: blackfriday.CommonHTMLFlags,
		}),
	}
}

func (r *Renderer) RenderNode(w io.Writer, node *blackfriday.Node, entering bool) blackfriday.WalkStatus {
	// Put any custom rendering logic here
	return r.base.RenderNode(w, node, entering)
}

func (r *Renderer) RenderHeader(w io.Writer, ast *blackfriday.Node) {
	r.base.RenderHeader(w, ast)
}

func (r *Renderer) RenderFooter(w io.Writer, ast *blackfriday.Node) {
	r.base.RenderFooter(w, ast)
}
