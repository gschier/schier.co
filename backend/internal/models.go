package internal

import (
	"github.com/lib/pq"
	"time"
)

type BlogPost struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`

	Content    string         `db:"content"`
	Date       time.Time      `db:"date"`
	EditedAt   time.Time      `db:"edited_at"`
	Image      string         `db:"image"`
	Published  bool           `db:"published"`
	Score      int            `db:"score"`
	Shares     int            `db:"shares"`
	Slug       string         `db:"slug"`
	Stage      int            `db:"stage"`
	Tags_      string         `db:"tags"`
	Tags       pq.StringArray `db:"tags2"`
	Title      string         `db:"title"`
	Unlisted   bool           `db:"unlisted"`
	UserID     string         `db:"user_id"`
	Views      int            `db:"views"`
	VotesTotal int            `db:"votes_total"`
	VotesUsers int            `db:"votes_users"`
}

type Book struct {
	ID string `db:"id"`

	Title  string `db:"title"`
	UserID string `db:"user_id"`
	Author string `db:"author"`
	Rank   int    `db:"rank"`
	Link   string `db:"link"`
}

type FavoriteThing struct {
	ID string `db:"id"`

	Priority    int    `db:"priority"`
	Name        string `db:"name"`
	Link        string `db:"link"`
	Description string `db:"description"`
}

type NewsletterSend struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`

	Key         string `db:"key"`
	Recipients  int    `db:"recipients"`
	Description string `db:"description"`
}

type Project struct {
	ID          string `db:"id"`
	Priority    int    `db:"priority"`
	Name        string `db:"name"`
	Link        string `db:"link"`
	Icon        string `db:"icon"`
	Description string `db:"description"`
	Retired     bool   `db:"retired"`
	Revenue     string `db:"revenue"`
	Reason      string `db:"reason"`
}

type Session struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`
}

type Subscriber struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`

	Email        string `db:"email"`
	Name         string `db:"name"`
	Unsubscribed bool   `db:"unsubscribed"`
}

type User struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`

	Email        string `db:"email"`
	Name         string `db:"name"`
	PasswordHash string `db:"password_hash"`
}
