package internal

import (
	"time"
)

type NewsletterSend struct {
	ID        string    `db:"id"`
	CreatedAt time.Time `db:"created_at"`

	Key         string `db:"key"`
	Recipients  int    `db:"recipients"`
	Description string `db:"description"`
}
