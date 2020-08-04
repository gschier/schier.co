package internal

import (
	"context"
	"net/http"

	"github.com/gschier/schier.co/internal/db"
)

type contextKey string

var (
	ctxKeyLoggedIn = contextKey("loggedIn")
	ctxKeyDB       = contextKey("db")
	ctxKeyUser     = contextKey("user")
)

func ctxDB(r *http.Request) *Storage {
	if c, ok := r.Context().Value(ctxKeyDB).(*Storage); ok {
		return c
	}

	panic("DB not set on request context")
}

func ctxGetUser(r *http.Request) *gen.User {
	if u, ok := r.Context().Value(ctxKeyUser).(*gen.User); ok {
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

func ctxSetDB(r *http.Request, db *Storage) *http.Request {
	ctx := r.Context()
	ctx = context.WithValue(ctx, ctxKeyDB, db)
	return r.WithContext(ctx)
}

func ctxSetUserAndLoggedIn(r *http.Request, u *gen.User) *http.Request {
	ctx := r.Context()
	ctx = context.WithValue(ctx, ctxKeyUser, u)
	ctx = context.WithValue(ctx, ctxKeyLoggedIn, u != nil)
	return r.WithContext(ctx)
}
