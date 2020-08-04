package internal

import (
	"time"
)

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
