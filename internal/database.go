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
	db    *sqlx.DB
	store *db.Store
	rand  *rand.Source
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
	store := db.NewStore(sqlxDB.DB, db.StoreConfig{
		BlogPostConfig: db.BlogPostConfig{
			HookPreInsert: func(m *db.BlogPost) {
				m.CreatedAt = time.Now()
				m.UpdatedAt = time.Now()
				m.EditedAt = time.Now()
			},
			HookPreUpdate: func(m *db.BlogPost) {
				m.UpdatedAt = time.Now()
				m.EditedAt = time.Now()
			},
		},
		UserConfig: db.UserConfig{
			HookPreInsert: func(m *db.User) {
				m.CreatedAt = time.Now()
			},
		},
	})
	return &Storage{
		db:    sqlxDB,
		store: store,
		rand:  source,
	}
}

func (s *Storage) DB() *sqlx.DB {
	return s.db
}

func (s *Storage) Subscribers(ctx context.Context) ([]Subscriber, error) {
	var subs []Subscriber
	err := s.db.SelectContext(ctx, &subs, `
		SELECT * FROM newsletter_subscribers
	`)
	return subs, err
}

func (s *Storage) RecentBlogPosts(ctx context.Context, limit uint64) ([]db.BlogPost, error) {
	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(true),
		db.Where.BlogPost.Unlisted.Eq(false),
	).Limit(limit).Sort(db.OrderBy.BlogPost.Date.Desc).All()
}

func (s *Storage) RecommendedBlogPosts(ctx context.Context, ignoreID *string, limit uint64) ([]db.BlogPost, error) {
	if ignoreID == nil {
		v := "something-arbitrary"
		ignoreID = &v
	}

	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(true),
		db.Where.BlogPost.Unlisted.Eq(false),
		db.Where.BlogPost.ID.NotEq(*ignoreID),
	).Limit(limit).Sort(db.OrderBy.BlogPost.Score.Desc).All()
}

func (s *Storage) TaggedAndPublishedBlogPosts(ctx context.Context, tag string, limit, offset int) ([]db.BlogPost, error) {
	q := s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(true),
		db.Where.BlogPost.Unlisted.Eq(false),
	)

	if tag != "" {
		q = q.Filter(db.Where.BlogPost.Tags.Contains([]string{tag}))
	}

	return q.Limit(uint64(limit)).Offset(uint64(offset)).All()
}

func (s *Storage) DraftBlogPosts(ctx context.Context) ([]db.BlogPost, error) {
	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(false),
	).Sort(
		db.OrderBy.BlogPost.Stage.Desc,
		db.OrderBy.BlogPost.EditedAt.Desc,
	).All()
}

func (s *Storage) UnlistedBlogPosts(ctx context.Context) ([]db.BlogPost, error) {
	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Unlisted.Eq(true),
	).Sort(
		db.OrderBy.BlogPost.UpdatedAt.Desc,
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

func (s *Storage) BlogPostByID(ctx context.Context, id string) (*db.BlogPost, error) {
	return s.store.BlogPosts.Get(id)
}

func (s *Storage) BlogPostBySlug(ctx context.Context, slug string) (*db.BlogPost, error) {
	return s.store.BlogPosts.Filter(db.Where.BlogPost.Slug.Eq(slug)).One()
}

func (s *Storage) RankedBooks(ctx context.Context) ([]Book, error) {
	var books []Book
	err := s.db.SelectContext(ctx, &books, `
		SELECT * FROM books ORDER BY rank ASC
	`)
	return books, err
}

func (s *Storage) RecentSubscribers(ctx context.Context) ([]Subscriber, error) {
	var subs []Subscriber
	err := s.db.SelectContext(ctx, &subs, `
		SELECT * FROM newsletter_subscribers ORDER BY created_at DESC
	`)
	return subs, err
}

func (s *Storage) SubscriberByID(ctx context.Context, id string) (*Subscriber, error) {
	var sub Subscriber
	err := s.db.GetContext(ctx, &sub, `
		SELECT * FROM newsletter_subscribers WHERE id = $1
	`, id)

	if err != nil {
		return nil, err
	}

	return &sub, nil
}

func (s *Storage) UnsubscribeSubscriber(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE newsletter_subscribers 
		SET unsubscribed = TRUE
		WHERE id = $1
	`, id)
	return err
}

func (s *Storage) CreateBlogPost(ctx context.Context, slug, title, content, image, userID string, tags []string, date time.Time, stage int64) error {
	_, err := s.store.BlogPosts.Insert(
		db.Set.BlogPost.ID(s.newID("pst_")),
		db.Set.BlogPost.Slug(slug),
		db.Set.BlogPost.Title(title),
		db.Set.BlogPost.Content(content),
		db.Set.BlogPost.Image(image),
		db.Set.BlogPost.UserID(userID),
		db.Set.BlogPost.Tags(tags),
		db.Set.BlogPost.Date(date),
		db.Set.BlogPost.Stage(stage),
	)
	return err
}

func (s *Storage) SearchPublishedBlogPosts(ctx context.Context, query string, limit uint64) ([]db.BlogPost, error) {
	if query == "" {
		return s.store.BlogPosts.None()
	}

	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(true),
		db.Where.BlogPost.Unlisted.Eq(false),
		db.Where.BlogPost.Or(
			db.Where.BlogPost.Content.IContains(query),
			db.Where.BlogPost.Title.IContains(query),
			db.Where.BlogPost.Tags.Contains([]string{strings.ToLower(query)}),
		),
	).Sort(db.OrderBy.BlogPost.UpdatedAt.Desc).Limit(limit).All()
}

func (s *Storage) DeleteBlogPostByID(ctx context.Context, id string) error {
	return s.store.BlogPosts.Filter(db.Where.BlogPost.ID.Eq(id)).Delete()
}

func (s *Storage) AllPublicBlogPosts(ctx context.Context) ([]db.BlogPost, error) {
	return s.store.BlogPosts.Filter(
		db.Where.BlogPost.Published.Eq(true),
		db.Where.BlogPost.Unlisted.Eq(false),
	).Sort(db.OrderBy.BlogPost.CreatedAt.Desc).All()
}

func (s *Storage) AllProjects(ctx context.Context) ([]Project, error) {
	var projects []Project
	err := s.db.SelectContext(ctx, &projects, `
		SELECT * FROM projects ORDER BY priority ASC
	`)
	return projects, err
}

func (s *Storage) AllFavoriteThings(ctx context.Context) ([]FavoriteThing, error) {
	var things []FavoriteThing
	err := s.db.SelectContext(ctx, &things, `
		SELECT * FROM favorite_things ORDER BY priority ASC
	`)
	return things, err
}

func (s *Storage) AllBooks(ctx context.Context) ([]Book, error) {
	var books []Book
	err := s.db.SelectContext(ctx, &books, `
		SELECT * FROM books ORDER BY rank ASC
	`)
	return books, err
}

func (s *Storage) NewsletterSubscriberByEmail(ctx context.Context, email string) (*Subscriber, error) {
	var sub Subscriber
	err := s.db.GetContext(ctx, &sub, `
		SELECT * FROM newsletter_subscribers WHERE email = $1
	`, email)

	if err != nil {
		return nil, err
	}

	return &sub, err
}

func (s *Storage) UpsertNewsletterSubscriber(ctx context.Context, email, name string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO newsletter_subscribers (id, email, name) 
		VALUES ($1, $2, $3)
		ON CONFLICT ON CONSTRAINT newsletter_subscribers_email_key 
		    DO UPDATE SET (email, name) = ($2, $3)
	`, s.newID("sub_"), email, name)
	return err
}

func (s *Storage) CreateNewsletterSend(ctx context.Context, key string, recipients int, description string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO newsletter_sends (id, key, recipients, description) 
		VALUES ($1, $2, $3, $4)
	`, s.newID("snd_"), key, recipients, description)
	return err
}

func (s *Storage) CreateSession(ctx context.Context, userID string) (string, error) {
	id := s.newID("ses_")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (id, user_id) VALUES ($1, $2)
	`, id, userID)
	return id, err
}

func (s *Storage) CreateUser(ctx context.Context, email, name, pwHash string) (*User, error) {
	u := User{
		ID:           s.newID("usr_"),
		CreatedAt:    time.Now(),
		Email:        email,
		Name:         name,
		PasswordHash: pwHash,
	}

	_, err := s.db.NamedExecContext(ctx, `
		INSERT INTO users (id, email, name, password_hash) 
		VALUES (:id, :email, :name, :password_hash)
	`, &u)

	return &u, err
}

func (s *Storage) UserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := s.db.GetContext(ctx, &user, `
		SELECT * FROM users WHERE email = $1
	`, email)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *Storage) UserBySessionID(ctx context.Context, sessionID string) (*User, error) {
	var user User
	err := s.db.GetContext(ctx, &user, `
		SELECT u.* FROM sessions AS s JOIN users AS u ON u.id = s.user_id 
		WHERE s.id = $1
	`, sessionID)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *Storage) SessionByID(ctx context.Context, id string) (*Session, error) {
	var session Session
	err := s.db.GetContext(ctx, &session, `
		SELECT * FROM sessions WHERE id = $1
	`, id)

	if err != nil {
		return nil, err
	}

	return &session, nil
}

func (s *Storage) IsNoResult(err error) bool {
	return err == sql.ErrNoRows
}

func (s *Storage) newID(prefix string) string {
	var id []byte
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"

	for i := 0; i < 12; i++ {
		id = append(id, letters[rand.Intn(len(letters))])
	}

	return fmt.Sprintf("%s%s", prefix, id)
}
