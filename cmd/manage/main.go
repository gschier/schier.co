package main

import (
	"context"
	"github.com/gschier/schier.co/internal"
	"github.com/gschier/schier.co/internal/migrate"
	_ "github.com/gschier/schier.co/migrations"
	"github.com/spf13/cobra"
	"log"
	"os"
)

var rootCmd = &cobra.Command{
	Use: "manage",
}

func main() {
	ctx := context.Background()

	initMigrate(ctx)
	initSendNewsletter(ctx)

	err := rootCmd.Execute()
	if err != nil {
		log.Println(err)
		os.Exit(1)
	}
}

func initMigrate(ctx context.Context) {
	migrateCmd := &cobra.Command{
		Use:   "migrate",
		Short: "Run database migrations",
	}

	yesAll := migrateCmd.PersistentFlags().Bool("yes", false, "Confirm all things")

	forwardCmd := &cobra.Command{
		Use:   "forward",
		Short: "Apply all pending migrations",
		Run: func(cmd *cobra.Command, args []string) {
			migrate.ForwardAll(ctx, internal.NewStorage().Store.DB, *yesAll)
		},
	}

	backwardCmd := &cobra.Command{
		Use:   "backward",
		Short: "Revert last migration",
		Run: func(cmd *cobra.Command, args []string) {
			migrate.BackwardOne(ctx, internal.NewStorage().Store.DB, *yesAll)
		},
	}

	migrateCmd.AddCommand(forwardCmd, backwardCmd)
	rootCmd.AddCommand(migrateCmd)
}

func initSendNewsletter(ctx context.Context) {
	newsletterCmd := &cobra.Command{
		Use:  "newsletter",
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			email := ""
			slug := args[0]
			if len(args) > 1 {
				email = args[1]
			}

			_, err := internal.SendNewsletter(slug, email)
			return err
		},
	}

	rootCmd.AddCommand(newsletterCmd)
}
