package schierco

import (
	"embed"
	"net/http"
)

//go:embed frontend/static
var static embed.FS

//go:embed templates
var templates embed.FS

var StaticFilesFS = http.FS(static)
var TemplatesFS = http.FS(templates)
