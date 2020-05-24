package backend

import (
	"context"
	"github.com/prisma/prisma-client-lib-go"
	"net/http"
)

type contextKey string

var (
	ctxKeyLoggedIn = contextKey("loggedIn")
	ctxKeyClient   = contextKey("prisma_client")
	ctxKeyUser     = contextKey("user")
)

func ctxPrismaClient(r *http.Request) *prisma.Client {
	if c, ok := r.Context().Value(ctxKeyClient).(*prisma.Client); ok {
		return c
	}

	panic("Prisma client not set on request context")
}

func ctxGetUser(r *http.Request) *prisma.User {
	if u, ok := r.Context().Value(ctxKeyUser).(*prisma.User); ok {
		return u
	}

	return nil
}

func ctxGetLoggedIn(r *http.Request) bool {
	if loggedIn, ok := r.Context().Value(ctxKeyLoggedIn).(bool); ok {
		return loggedIn
	}

	return false
}

func ctxSetPrismaClient(r *http.Request, c *prisma.Client) *http.Request {
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
