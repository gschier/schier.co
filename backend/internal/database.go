package internal

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	_ "github.com/lib/pq"
	"math/rand"
	"os"
	"time"
)

var _s *Storage

type Storage struct {
	db   *sqlx.DB
	rand *rand.Source
}

func NewStorage() *Storage {
	if _s == nil {
		source := rand.NewSource(time.Now().Unix())
		_s = NewStorageWithSource(&source)
	}

	return _s
}

func NewStorageWithSource(source *rand.Source) *Storage {
	return &Storage{
		db:   sqlx.MustConnect("postgres", os.Getenv("DATABASE_URL")),
		rand: source,
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

func (s *Storage) RecentBlogPosts(ctx context.Context, limit int) ([]BlogPost, error) {
	var posts []BlogPost
	err := s.db.SelectContext(ctx, &posts, `
		SELECT * FROM blog_posts
		WHERE published IS TRUE AND
		   	  unlisted IS FALSE 
		ORDER BY date DESC
		LIMIT $1
	`, limit)
	return posts, err
}

func (s *Storage) RecommendedBlogPosts(ctx context.Context, ignoreID *string, limit int) ([]BlogPost, error) {
	var posts []BlogPost

	if ignoreID == nil {
		v := "something-arbitrary"
		ignoreID = &v
	}

	err := s.db.SelectContext(ctx, &posts, `
		SELECT * FROM blog_posts
		WHERE published IS TRUE AND
		   	  unlisted IS FALSE AND
			  id != $1
		ORDER BY score DESC
		LIMIT $2
	`, *ignoreID, limit)

	return posts, err
}

func (s *Storage) TaggedAndPublishedBlogPosts(ctx context.Context, tag string, limit, offset int) ([]BlogPost, error) {
	var posts []BlogPost
	var err error
	if tag == "" {
		err = s.db.SelectContext(ctx, &posts, `
			SELECT * FROM blog_posts
			WHERE published IS TRUE 
			  AND unlisted IS FALSE
			ORDER BY date DESC
			LIMIT $1
			OFFSET $2
		`, limit, offset)
	} else {
		err = s.db.SelectContext(ctx, &posts, `
			SELECT * FROM blog_posts
			WHERE $1 = ANY(tags) 
			  AND published IS TRUE 
			  AND unlisted IS FALSE
			ORDER BY date DESC
			LIMIT $2
			OFFSET $3
		`, tag, limit, offset)
	}

	return posts, err
}

func (s *Storage) DraftBlogPosts(ctx context.Context) ([]BlogPost, error) {
	var posts []BlogPost
	err := s.db.SelectContext(ctx, &posts, `
		SELECT * FROM blog_posts
		WHERE published IS FALSE
		ORDER BY stage DESC, edited_at DESC
	`)
	return posts, err
}

func (s *Storage) UnlistedBlogPosts(ctx context.Context) ([]BlogPost, error) {
	var posts []BlogPost
	err := s.db.SelectContext(ctx, &posts, `
		SELECT * FROM blog_posts
		WHERE unlisted IS TRUE
		ORDER BY updated_at DESC
	`)
	return posts, err
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

func (s *Storage) BlogPostByID(ctx context.Context, id string) (*BlogPost, error) {
	var blogPost BlogPost
	err := s.db.GetContext(ctx, &blogPost, `
		SELECT * FROM blog_posts WHERE id = $1
	`, id)

	if err != nil {
		return nil, err
	}

	return &blogPost, nil
}

func (s *Storage) BlogPostBySlug(ctx context.Context, slug string) (*BlogPost, error) {
	var blogPost BlogPost
	err := s.db.GetContext(ctx, &blogPost, `
		SELECT * FROM blog_posts WHERE slug = $1
	`, slug)

	if err != nil {
		return nil, err
	}

	return &blogPost, nil
}

func (s *Storage) UpdateBlogPostUnlisted(ctx context.Context, id string, unlisted bool) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts SET unlisted = $2 WHERE id = $1
	`, id, unlisted)
	return err
}

func (s *Storage) UpdateBlogPostStats(ctx context.Context, id string, views, score int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts 
		SET (views, score) = ($2, $3) 
		WHERE id = $1
	`, id, views, score)
	return err
}

func (s *Storage) UpdateBlogPostShares(ctx context.Context, id string, shares int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts 
		SET shares = $2
		WHERE id = $1
	`, id, shares)
	return err
}

func (s *Storage) IncrementBlogPostDonations(ctx context.Context, slug string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts 
		SET donations = donations + 1
		WHERE slug = $1
	`, slug)
	return err
}

func (s *Storage) RankedBooks(ctx context.Context) ([]Book, error) {
	var books []Book
	err := s.db.SelectContext(ctx, &books, `
		SELECT * FROM books ORDER BY rank DESC
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

func (s *Storage) UpdateBlogPostVotes(ctx context.Context, id string, user, total int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts 
		SET (votes_users, votes_total) = ($2, $3) 
		WHERE id = $1
	`, id, user, total)
	return err
}

func (s *Storage) UpdateBlogPost(ctx context.Context, id, slug, title, content, image string, tags []string, date time.Time, stage int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts 
		SET (slug, title, content, image, tags, date, stage) = ($2, $3, $4, $5, $6, $7, $8) 
		WHERE id = $1`, id, slug, title, content, image, pq.Array(tags), date, stage)
	return err
}

func (s *Storage) CreateBlogPost(ctx context.Context, slug, title, content, image, userID string, tags []string, date time.Time, stage int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO blog_posts (id, slug, title, content, image, user_id, tags, stage, date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
	`, s.newID("pst_"), slug, title, content, image, userID, pq.Array(tags), stage, date)
	return err
}

func (s *Storage) SearchPublishedBlogPosts(ctx context.Context, query string, limit int) ([]BlogPost, error) {
	var posts []BlogPost

	if query == "" {
		return posts, nil
	}

	err := s.db.SelectContext(ctx, &posts, `
		SELECT * FROM blog_posts
		WHERE (content ILIKE '%' || $1 || '%'
			OR title ILIKE '%' || $1 || '%'
			OR $1 = ANY(tags))
			AND published IS TRUE
			AND unlisted IS FALSE
		ORDER BY updated_at DESC
		LIMIT $2
	`, query, limit)
	return posts, err
}

func (s *Storage) UpdateBlogPostPublished(ctx context.Context, id string, published bool) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE blog_posts SET published = $2 WHERE id = $1
	`, published, id)
	return err
}

func (s *Storage) DeleteBlogPostByID(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM blog_posts WHERE id = $1
	`, id)
	return err
}

func (s *Storage) AllBlogPosts(ctx context.Context) ([]BlogPost, error) {
	var blogPosts []BlogPost
	err := s.db.SelectContext(ctx, &blogPosts, `
		SELECT * FROM blog_posts ORDER BY created_at DESC
	`)
	return blogPosts, err
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
