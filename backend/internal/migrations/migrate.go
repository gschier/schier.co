package migrations

import (
	"bufio"
	"context"
	"fmt"
	"github.com/jmoiron/sqlx"
	"log"
	"os"
	"strings"
	"time"
)

var All = make([]Migration, 0)

type HistoryModel struct {
	Id      int       `db:"id"`
	Name    string    `db:"name"`
	Applied time.Time `db:"applied"`
}

type Migration struct {
	Number  int
	Name    string
	Forward func(ctx context.Context, db *sqlx.DB) error
	Reverse func(ctx context.Context, db *sqlx.DB) error
}

func ForwardAll(ctx context.Context, migrations []Migration, db *sqlx.DB, yesAll bool) {
	// Initialize migrations table
	err := initTable(ctx, db)
	if err != nil {
		panic(err)
	}

	// Get migration history
	history, err := getHistory(ctx, db)
	if err != nil {
		panic(err)
	}

	// Run migrations
	fmt.Printf("[migrate] Attempting to migrate\n")
	for i, m := range migrations {
		if i < len(history) {
			h := history[i]
			if h.Name == m.Name {
				fmt.Println("[migrate] Skipping", m.Name)
				continue
			} else {
				log.Fatalf("[migrate] Unexpected migration '%s'. Expected '%s'\n", m.Name, h.Name)
			}
		}

		if !yesAll && !askForConfirmation(fmt.Sprintf("Really apply %s?", m.Name)) {
			return
		}

		// Run migration code
		fmt.Println("[migrate] Running migration", m.Name)
		err = m.Forward(ctx, db)
		if err != nil {
			panic(fmt.Sprintf("[migrate] Failed %s err=%v\n", m.Name, err))
		}

		// Mark complete
		err = insertHistoryItem(ctx, db, m.Name)
		if err != nil {
			panic(err)
		}

		fmt.Println("[migrate] Completed migration", m.Name)
	}

}

func Undo(ctx context.Context, migrations []Migration, db *sqlx.DB, yesAll bool) {
	// Initialize migrations table
	err := initTable(ctx, db)
	if err != nil {
		panic(err)
	}

	// Get migration history
	history, err := getHistory(ctx, db)
	if err != nil {
		panic(err)
	}

	if len(history) == 0 {
		fmt.Println("[migrate] Nothing to undo")
		return
	}

	// Run migrations
	fmt.Println("[migrate] Attempting to undo")
	toUndo := history[len(history)-1]
	var migration *Migration = nil
	for _, m := range migrations {
		if toUndo.Name == m.Name {
			migration = &m
			break
		}
	}

	if migration == nil {
		log.Fatalln("[migrate] Migration not found")
	}

	if !yesAll && !askForConfirmation(fmt.Sprintf("Really undo %s?", migration.Name)) {
		return
	}

	fmt.Printf("[migrate] Undoing migration %s\n", migration.Name)

	// Run migration code
	err = migration.Reverse(ctx, db)
	if err != nil {
		panic(fmt.Sprintf("[migrate] Failed %s err=%v\n", migration.Name, err))
	}

	// Mark complete
	err = deleteHistoryItem(ctx, db, migration.Name)
	if err != nil {
		panic(err)
	}

	fmt.Printf("[migrate] Completed rollback %s\n", migration.Name)

}

func Mark(ctx context.Context, db *sqlx.DB, migration Migration) {
	// Initialize migrations table
	err := initTable(ctx, db)
	if err != nil {
		panic(err)
	}

	if !askForConfirmation(fmt.Sprintf("Really mark %s as migrated?", migration.Name)) {
		return
	}

	err = insertHistoryItem(ctx, db, migration.Name)
	if err != nil {
		panic(err)
	}

	fmt.Printf("[migrate] Marked migration '%s'\n", migration.Name)
}

func initTable(ctx context.Context, db *sqlx.DB) error {
	tx := db.MustBeginTx(ctx, nil)

	_ = tx.MustExecContext(ctx, `
		CREATE TABLE migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			applied TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
		);
	`)

	err := tx.Commit()
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	fmt.Printf("[migrate] Migrations table created\n")
	return nil
}

func getHistory(ctx context.Context, db *sqlx.DB) ([]HistoryModel, error) {
	var history []HistoryModel
	err := db.SelectContext(ctx, &history, "SELECT id, name, applied FROM migrations ORDER BY id ASC;")
	return history, err
}

func insertHistoryItem(ctx context.Context, db *sqlx.DB, name string) error {
	_, err := db.ExecContext(ctx, "INSERT INTO migrations (name) VALUES ($1)", name)
	return err
}

func deleteHistoryItem(ctx context.Context, db *sqlx.DB, name string) error {
	_, err := db.ExecContext(ctx, "DELETE FROM migrations WHERE name=$1", name)
	return err
}

// askForConfirmation asks the user for confirmation. A user must type in "yes" or "no" and
// then press enter. It has fuzzy matching, so "y", "Y", "yes", "YES", and "Yes" all count as
// confirmations. If the input is not recognized, it will ask again. The function does not return
// until it gets a valid response from the user.
func askForConfirmation(s string) bool {
	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Printf("[migrate] %s [y/N]: ", s)

		response, err := reader.ReadString('\n')
		if err != nil {
			panic(err)
		}

		response = strings.ToLower(strings.TrimSpace(response))

		if response == "y" || response == "yes" {
			return true
		} else {
			return false
		}
	}
}
