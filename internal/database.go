package internal

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/gschier/schier.co/internal/db"
)

var _s *Storage

type Storage struct {
	db   *sqlx.DB
	rand *rand.Source

	Store *gen.Store
}

func NewStorage() *Storage {
	if _s == nil {
		source := rand.NewSource(time.Now().Unix())
		_s = NewStorageWithSource(&source)
	}

	return _s
}

func NewStorageWithSource(source *rand.Source) *Storage {
	sqlxDB := sqlx.MustConnect("postgres", os.Getenv("DATABASE_URL"))
	store := gen.NewStore(sqlxDB.DB, gen.StoreConfig{
		BlogPostConfig: gen.BlogPostConfig{
			HookPreInsert: func(m *gen.BlogPost) {
				m.ID = newID("pst_")
				m.CreatedAt = time.Now()
				m.UpdatedAt = time.Now()
				m.EditedAt = time.Now()
			},
			HookPreUpdate: func(m *gen.BlogPost) {
				m.UpdatedAt = time.Now()
				m.EditedAt = time.Now()
			},
		},
		UserConfig: gen.UserConfig{
			HookPreInsert: func(m *gen.User) {
				m.ID = newID("usr_")
				m.CreatedAt = time.Now()
			},
		},
		NewsletterSubscriberConfig: gen.NewsletterSubscriberConfig{
			HookPreInsert: func(m *gen.NewsletterSubscriber) {
				m.ID = newID("sub_")
				m.CreatedAt = time.Now()
				m.UpdatedAt = time.Now()
			},
			HookPreUpdate: func(m *gen.NewsletterSubscriber) {
				m.UpdatedAt = time.Now()
			},
		},
	})
	return &Storage{
		db:    sqlxDB,
		Store: store,
		rand:  source,
	}
}

func (s *Storage) DB() *sqlx.DB {
	return s.db
}

func (s *Storage) RecentBlogPosts(ctx context.Context, limit uint64) ([]gen.BlogPost, error) {
	return s.Store.BlogPosts.
		Filter(
			gen.Where.BlogPost.Published.True(),
			gen.Where.BlogPost.Unlisted.False(),
		).
		Sort(gen.OrderBy.BlogPost.Date.Desc).
		Limit(limit).
		All()
}

func (s *Storage) RecommendedBlogPosts(ctx context.Context, ignoreID *string, limit uint64) ([]gen.BlogPost, error) {
	if ignoreID == nil {
		v := "something-arbitrary"
		ignoreID = &v
	}

	return s.Store.BlogPosts.
		Filter(
			gen.Where.BlogPost.Published.True(),
			gen.Where.BlogPost.Unlisted.False(),
			gen.Where.BlogPost.ID.NotEq(*ignoreID),
		).
		Limit(limit).
		Sort(gen.OrderBy.BlogPost.Score.Desc).
		All()
}

func (s *Storage) TaggedAndPublishedBlogPosts(ctx context.Context, tag string, limit, offset int) ([]gen.BlogPost, error) {
	q := s.Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.True(),
		gen.Where.BlogPost.Unlisted.False(),
	)

	if tag != "" {
		q = q.Filter(gen.Where.BlogPost.Tags.Contains([]string{tag}))
	}

	return q.Limit(uint64(limit)).
		Offset(uint64(offset)).
		Sort(gen.OrderBy.BlogPost.Date.Desc).
		All()
}

func (s *Storage) DraftBlogPosts(ctx context.Context) ([]gen.BlogPost, error) {
	return s.Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.False(),
	).Sort(
		gen.OrderBy.BlogPost.Stage.Desc,
		gen.OrderBy.BlogPost.EditedAt.Desc,
	).All()
}

func (s *Storage) UnlistedBlogPosts(ctx context.Context) ([]gen.BlogPost, error) {
	return s.Store.BlogPosts.Filter(
		gen.Where.BlogPost.Unlisted.True(),
	).Sort(
		gen.OrderBy.BlogPost.UpdatedAt.Desc,
	).All()
}

func (s *Storage) NewsletterSendByKey(ctx context.Context, key string) (*NewsletterSend, error) {
	var send NewsletterSend
	err := s.db.GetContext(ctx, &send, `
		SELECT * FROM newsletter_sends WHERE key = $1
	`, key)

	if err != nil {
		return nil, err
	}

	return &send, nil
}

func (s *Storage) SearchPublishedBlogPosts(ctx context.Context, query string, limit uint64) ([]gen.BlogPost, error) {
	if query == "" {
		return s.Store.BlogPosts.None()
	}

	return s.Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.True(),
		gen.Where.BlogPost.Unlisted.False(),
		gen.Where.BlogPost.Or(
			gen.Where.BlogPost.Content.IContains(query),
			gen.Where.BlogPost.Title.IContains(query),
			gen.Where.BlogPost.Tags.Contains([]string{strings.ToLower(query)}),
		),
	).Sort(gen.OrderBy.BlogPost.UpdatedAt.Desc).Limit(limit).All()
}

func (s *Storage) AllPublicBlogPosts(ctx context.Context) ([]gen.BlogPost, error) {
	return s.Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.True(),
		gen.Where.BlogPost.Unlisted.False(),
	).Sort(gen.OrderBy.BlogPost.CreatedAt.Desc).All()
}

func (s *Storage) CreateNewsletterSend(ctx context.Context, key string, recipients int, description string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO newsletter_sends (id, key, recipients, description) 
		VALUES ($1, $2, $3, $4)
	`, newID("snd_"), key, recipients, description)
	return err
}

func (s *Storage) CreateSession(ctx context.Context, userID string) (string, error) {
	id := newID("ses_")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (id, user_id) VALUES ($1, $2)
	`, id, userID)
	return id, err
}

func (s *Storage) UserBySessionID(ctx context.Context, sessionID string) (*gen.User, error) {
	session, err := s.Store.Sessions.Get(sessionID)
	if err != nil {
		return nil, err
	}

	return s.Store.Users.Get(session.UserID)
}

func (s *Storage) IsNoResult(err error) bool {
	return err == sql.ErrNoRows
}

func newID(prefix string) string {
	var id []byte
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"

	for i := 0; i < 12; i++ {
		id = append(id, letters[rand.Intn(len(letters))])
	}

	return fmt.Sprintf("%s%s", prefix, id)
}
