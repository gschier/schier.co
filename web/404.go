package web

import (
	"github.com/gorilla/mux"
)

func NotFoundRoutes(router *mux.Router) {
	router.NotFoundHandler = renderHandler("404.html", nil)
}
