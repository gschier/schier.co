package migrations

import (
	"context"
	"database/sql"

	"github.com/gschier/schier.co/internal/migrate"
)

func init() {
	migrate.Register(migrate.Migration{
		Name: "0005__add_donations_col",
		Forward: func(ctx context.Context, db *sql.DB) error {
			_, err := db.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN donations INTEGER NOT NULL DEFAULT 0
			`)
			return err
		},
		Reverse: func(ctx context.Context, db *sql.DB) error {
			_, err := db.ExecContext(ctx, `
				ALTER TABLE blog_posts
				DROP COLUMN donations
			`)
			return err
		},
	})
}
