package migrations

import (
	"context"
	"database/sql"

	"github.com/gschier/schier.co/internal/migrate"
)

func init() {
	migrate.Register(migrate.Migration{
		Name: "0004__remove_old_tags_col",
		Forward: func(ctx context.Context, db *sql.DB) error {
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				return err
			}

			_, err = tx.ExecContext(ctx, `
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
		Reverse: func(ctx context.Context, db *sql.DB) error {
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				return err
			}

			_, err = tx.ExecContext(ctx, `
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
