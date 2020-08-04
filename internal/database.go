package internal

import (
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
	Store *gen.Store
}

func NewStorage() *Storage {
	if _s == nil {
		_s = NewStorageWithSource(rand.NewSource(time.Now().Unix()))
	}

	return _s
}

func NewStorageWithSource(source rand.Source) *Storage {
	sqlDB, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}

	random := rand.New(source)
	newID := func(prefix string) string {
		var id []byte
		const letters = "abcdefghijklmnopqrstuvwxyz0123456789"

		for i := 0; i < 12; i++ {
			id = append(id, letters[random.Intn(len(letters))])
		}

		return fmt.Sprintf("%s%s", prefix, id)
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
		Store: store,
	}
}

func recentBlogPosts(store *gen.Store, limit uint64) *gen.BlogPostQueryset {
	return store.BlogPosts.
		Filter(
			gen.Where.BlogPost.Published.True(),
			gen.Where.BlogPost.Unlisted.False(),
		).
		Sort(gen.OrderBy.BlogPost.Date.Desc).
		Limit(limit)
}

func recommendedBlogPosts(store *gen.Store, ignoreID *string, limit uint64) *gen.BlogPostQueryset {
	if ignoreID == nil {
		v := "something-arbitrary"
		ignoreID = &v
	}

	return store.BlogPosts.
		Filter(
			gen.Where.BlogPost.Published.True(),
			gen.Where.BlogPost.Unlisted.False(),
			gen.Where.BlogPost.ID.NotEq(*ignoreID),
		).
		Limit(limit).
		Sort(gen.OrderBy.BlogPost.Score.Desc)
}
