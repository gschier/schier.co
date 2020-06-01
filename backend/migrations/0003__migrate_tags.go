package migrations

import (
	"context"
	"github.com/gschier/schier.dev/internal/migrate"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"regexp"
	"strings"
)

func init() {
	allMigrations = append(allMigrations, migrate.Migration{
		Name: "0003__migrate_tags",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()
			_, err := tx.ExecContext(ctx, `
				ALTER TABLE blog_posts
				ADD COLUMN tags2 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
			`)

			var rows []struct {
				ID   string
				Tags string
			}

			err = tx.SelectContext(ctx, &rows, "SELECT tags, id FROM blog_posts")
			if err != nil {
				return err
			}

			stringToTags := func(tags string) []string {
				tags = strings.TrimPrefix(tags, "|")
				tags = strings.TrimSuffix(tags, "|")
				allTags := regexp.MustCompile("[|,]").Split(tags, -1)
				filteredTags := make([]string, 0)
				for _, t := range allTags {
					newTag := strings.ToLower(strings.TrimSpace(t))
					if newTag == "" {
						continue
					}
					filteredTags = append(filteredTags, newTag)
				}
				return filteredTags
			}

			for _, row := range rows {
				_, err = tx.ExecContext(ctx, `
					UPDATE blog_posts
					SET tags2 = $2
					WHERE id = $1
				`, row.ID, pq.Array(stringToTags(row.Tags)))
				if err != nil {
					return err
				}
			}

			return tx.Commit()
		},
		Reverse: func(ctx context.Context, db *sqlx.DB) error {
			_, err := db.Exec(`
				ALTER TABLE blog_posts DROP COLUMN tags2
			`)

			return err
		},
	})
}
