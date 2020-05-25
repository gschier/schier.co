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
		Name: "0002__import_data",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			tx := db.MustBegin()

			panicErr := func(err error) {
				if err != nil {
					panic(err)
				}
			}

			panicErr(migrateUsers(ctx, tx))
			panicErr(migrateBlogPosts(ctx, tx))
			panicErr(migrateSubscribers(ctx, tx))
			panicErr(migrateProjects(ctx, tx))
			panicErr(migrateBooks(ctx, tx))
			panicErr(migrateFavoriteThings(ctx, tx))
			panicErr(migrateNewsletterSends(ctx, tx))

			return tx.Commit()
		},
		Reverse: func(ctx context.Context, db *sqlx.DB) error {
			return nil
		},
	})
}

func migrateUsers(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing User.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_User.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		ID           string `json:"id"`
		CreatedAt    string `json:"createdAt"`
		Email        string `json:"email"`
		Name         string `json:"name"`
		PasswordHash string `json:"passwordHash"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO users (id, created_at, email, name, password_hash)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.CreatedAt, e.Email, e.Name, e.PasswordHash)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateBlogPosts(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing BlogPost.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_BlogPost.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		ID          string `json:"id"`
		CreatedAt   string `json:"createdAt"`
		UpdatedAt   string `json:"updatedAt"`
		Published   bool   `json:"published"`
		Slug        string `json:"slug"`
		Title       string `json:"title"`
		Date        string `json:"date"`
		Content     string `json:"content"`
		Tags        string `json:"tags"`
		Author      string `json:"author"`
		Image       string `json:"image"`
		Views       int    `json:"views"`
		VotesTotal  int    `json:"votesTotal"`
		VotesUsers  int    `json:"votesUsers"`
		Unlisted    bool   `json:"unlisted"`
		Stage       int    `json:"stage"`
		Shares      int    `json:"shares"`
		Score       int    `json:"score"`
		DateUpdated string `json:"dateUpdated"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		// Default date updated because it used to be nullable
		if e.DateUpdated == "" {
			e.DateUpdated = e.Date
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO blog_posts (id, created_at, updated_at, content, date, edited_at, image, published, score, 
			                   shares, slug, stage, tags, title, unlisted, user_id, views, votes_total, votes_users)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.CreatedAt, e.UpdatedAt, e.Content, e.Date, e.DateUpdated, e.Image, e.Published, e.Score, e.Shares,
			e.Slug, e.Stage, e.Tags, e.Title, e.Unlisted, e.Author, e.Views, e.VotesTotal, e.VotesUsers)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateSubscribers(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing Subscriber.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_Subscriber.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		ID           string `json:"id"`
		CreatedAt    string `json:"createdAt"`
		UpdatedAt    string `json:"updatedAt"`
		Email        string `json:"email"`
		Name         string `json:"name"`
		Unsubscribed bool   `json:"unsubscribed"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO newsletter_subscribers (id, created_at, updated_at, email, name, unsubscribed)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.CreatedAt, e.UpdatedAt, e.Email, e.Name, e.Unsubscribed)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateProjects(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing Project.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_Project.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		ID          string `json:"id"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		Link        string `json:"link"`
		Name        string `json:"name"`
		Priority    int64  `json:"priority"`
		Reason      string `json:"reason"`
		Retired     bool   `json:"retired"`
		Revenue     string `json:"revenue"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO projects (id, description, icon, link, name, priority, reason, retired, revenue)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.Description, e.Icon, e.Link, e.Name, e.Priority, e.Reason, e.Retired, e.Revenue)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateBooks(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing Book.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_Book.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		Author string `json:"author"`
		ID     string `json:"id"`
		Link   string `json:"link"`
		Rank   int64  `json:"rank"`
		Title  string `json:"title"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO books (id, author, link, rank, title)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.Author, e.Link, e.Rank, e.Title)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateFavoriteThings(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing FavoriteThing.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_FavoriteThing.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		Description string `json:"description"`
		ID          string `json:"id"`
		Link        string `json:"link"`
		Name        string `json:"name"`
		Priority    int64  `json:"priority"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO favorite_things (id, description, link, name, priority)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.Description, e.Link, e.Name, e.Priority)
		if err != nil {
			return err
		}
	}

	return nil
}

func migrateNewsletterSends(ctx context.Context, tx *sqlx.Tx) error {
	log.Println("Importing NewsletterSend.json")
	bytes, err := ioutil.ReadFile("./dumps/schierdatabase_default_default_NewsletterSend.json")
	if err != nil {
		log.Println("Dump file not found. Skipping...")
		return nil
	}

	var entries []struct {
		CreatedAt   string `json:"createdAt"`
		Description string `json:"description"`
		ID          string `json:"id"`
		Key         string `json:"key"`
		Recipients  int64  `json:"recipients"`
	}

	err = json.Unmarshal(bytes, &entries)
	if err != nil {
		return err
	}

	for _, e := range entries {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO newsletter_sends (id, created_at, description, key, recipients)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT DO NOTHING 
		`, e.ID, e.CreatedAt, e.Description, e.Key, e.Recipients)
		if err != nil {
			return err
		}
	}

	return nil
}
