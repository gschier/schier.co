package migrations

import (
	"context"
	"database/sql"

	"github.com/gschier/schier.co/internal/migrate"
)

func init() {
	migrate.Register(migrate.Migration{
		Name: "0006__add_summary_col",
		Forward: func(ctx context.Context, db *sql.DB) error {
			_, err := db.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN summary TEXT NOT NULL DEFAULT ''
			`)
			return err
		},
		Reverse: func(ctx context.Context, db *sql.DB) error {
			_, err := db.ExecContext(ctx, `
				ALTER TABLE blog_posts
				DROP COLUMN summary
			`)
			return err
		},
	})
}
