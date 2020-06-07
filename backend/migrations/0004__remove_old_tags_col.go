package migrations

import (
	"context"
	"github.com/gschier/schier.co/internal/migrate"
	"github.com/jmoiron/sqlx"
)

func init() {
	allMigrations = append(allMigrations, migrate.Migration{
		Name: "0004__remove_old_tags_col",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()

			_, err := tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				DROP COLUMN tags
			`)
			if err != nil {
				return err
			}

			_, err = tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				RENAME COLUMN tags2 TO tags
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
				RENAME COLUMN tags TO tags2
			`)
			if err != nil {
				return err
			}

			_, err = tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN tags TEXT
			`)
			if err != nil {
				return err
			}

			return tx.Commit()
		},
	})
}
