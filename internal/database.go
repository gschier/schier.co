package internal

import (
	"context"
	"database/sql"
	"fmt"
	_ "github.com/lib/pq"
	"math/rand"
	"os"
	"time"

	"github.com/gschier/schier.co/internal/db"
)

var _s *Storage

type Storage struct {
	db   *sql.DB
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
	sqlDB, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}

	store := gen.NewStore(sqlDB, gen.StoreConfig{
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
		SessionConfig: gen.SessionConfig{
			HookPreInsert: func(m *gen.Session) {
				m.ID = newID("ses_")
				m.CreatedAt = time.Now()
			},
		},
		NewsletterSendConfig: gen.NewsletterSendConfig{
			HookPreInsert: func(m *gen.NewsletterSend) {
				m.ID = newID("snd_")
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
		db:    sqlDB,
		Store: store,
		rand:  source,
	}
}

func (s *Storage) DB() *sql.DB {
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

func newID(prefix string) string {
	var id []byte
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"

	for i := 0; i < 12; i++ {
		id = append(id, letters[rand.Intn(len(letters))])
	}

	return fmt.Sprintf("%s%s", prefix, id)
}
