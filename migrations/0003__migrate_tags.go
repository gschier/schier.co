package migrations

import (
	"context"
	"database/sql"

	"github.com/gschier/schier.co/internal/migrate"
)

func init() {
	allMigrations = append(allMigrations, migrate.Migration{
		Name: "0003__migrate_tags",
		Forward: func(ctx context.Context, db *sql.DB) error {
			_, err := db.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN tags2 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
			`)

			return err
		},
		Reverse: func(ctx context.Context, db *sql.DB) error {
			_, err := db.Exec(`
				ALTER TABLE blog_posts DROP COLUMN tags2
			`)

			return err
		},
	})
}
