package migrations

import (
	"context"
	"encoding/json"
	"github.com/gschier/schier.dev/internal"
	"github.com/jmoiron/sqlx"
	"io/ioutil"
	"log"
)

func init() {
	allMigrations = append(allMigrations, internal.Migration{
		Name: "0004__fix_post_votes",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()

			log.Println("Importing BlogPost.json")
			bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_BlogPost.json")
			if err != nil {
				log.Println("Dump file not found. Skipping...")
				return nil
			}

			var entries []struct {
				ID         string `json:"id"`
				VotesUsers int    `json:"votesUsers"`
			}

			err = json.Unmarshal(bytes, &entries)
			if err != nil {
				return err
			}

			for _, e := range entries {
				_, err = tx.ExecContext(ctx, `
					UPDATE blog_posts SET votes_users = $2
					WHERE id = $1
				`, e.ID, e.VotesUsers)
				if err != nil {
					return err
				}
			}

			return tx.Commit()
		},
		Reverse: func(ctx context.Context, db *sqlx.DB) error {
			return nil
		},
	})
}

func updateBlogPostVotes(ctx context.Context, tx *sqlx.Tx) error {
}
