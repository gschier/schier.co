package web

import (
	"context"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"net/http"
)

type contextKey string

var (
	ctxKeyClient   = contextKey("prisma_client")
	ctxKeyLoggedIn = contextKey("logged_in")
	ctxKeyUser     = contextKey("user")
)

func ctxGetClient(r *http.Request) *prisma.Client {
	return r.Context().Value(ctxKeyClient).(*prisma.Client)
}

func ctxGetUser(r *http.Request) *prisma.User {
	return r.Context().Value(ctxKeyUser).(*prisma.User)
}

func ctxGetLoggedIn(r *http.Request) bool {
	return r.Context().Value(ctxKeyLoggedIn).(bool)
}

func ctxSetClient(r *http.Request, c *prisma.Client) *http.Request {
	ctx := r.Context()
	ctx = context.WithValue(ctx, ctxKeyClient, c)
	return r.WithContext(ctx)
}

func ctxSetUserAndLoggedIn(r *http.Request, u *prisma.User) *http.Request {
	ctx := r.Context()
	ctx = context.WithValue(ctx, ctxKeyUser, u)
	ctx = context.WithValue(ctx, ctxKeyLoggedIn, u != nil)
	return r.WithContext(ctx)
}
