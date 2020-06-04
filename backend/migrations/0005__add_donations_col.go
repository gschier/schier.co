package migrations

import (
	"context"
	"github.com/gschier/schier.dev/internal/migrate"
	"github.com/jmoiron/sqlx"
)

func init() {
	allMigrations = append(allMigrations, migrate.Migration{
		Name: "0005__add_donations_col",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()

			_, err := tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN donations INTEGER NOT NULL DEFAULT 0
			`)
			if err != nil {
				return err
			}

			return tx.Commit()
		},
		Reverse: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()

			_, err := tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				DROP COLUMN donations
			`)
			if err != nil {
				return err
			}

			return tx.Commit()
		},
	})
}
