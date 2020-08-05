package migrations

import (
	"context"
	"database/sql"

	"github.com/gschier/schier.co/internal/migrate"
)

func init() {
	migrate.Register(migrate.Migration{
		Name: "0002__import_data",
		Forward: func(ctx context.Context, db *sql.DB) error {
			// No longer needed
			return nil
		},
		Reverse: func(ctx context.Context, db *sql.DB) error {
			return nil
		},
	})
}
