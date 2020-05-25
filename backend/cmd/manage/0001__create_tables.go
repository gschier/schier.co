package main

import (
	"context"
	"github.com/gschier/schier.dev/internal/migrations"
	"github.com/jmoiron/sqlx"
)

func init() {
	allMigrations = append(allMigrations, migrations.Migration{
		Name: "0001__create_tables",
		Forward: func(ctx context.Context, db *sqlx.DB) error {
			_, err := db.ExecContext(ctx, `
				CREATE TABLE projects (
					id          VARCHAR(25) NOT NULL PRIMARY KEY,
					description TEXT        NOT NULL,
					icon        TEXT        NOT NULL,
					link        TEXT        NOT NULL,
					name        TEXT        NOT NULL,
					priority    INTEGER     NOT NULL,
					reason      TEXT        NOT NULL,
					retired     BOOLEAN     NOT NULL,
					revenue     TEXT        NOT NULL
				);

				CREATE TABLE favorite_things (
					id          VARCHAR(25) NOT NULL PRIMARY KEY,
					description TEXT        NOT NULL,
					link        TEXT        NOT NULL,
					name        TEXT        NOT NULL,
					priority    INTEGER     NOT NULL
				);

				CREATE TABLE books (
					id     VARCHAR(25) NOT NULL PRIMARY KEY,
					author TEXT        NOT NULL,
					link   TEXT        NOT NULL,
					rank   INTEGER     NOT NULL,
					title  TEXT        NOT NULL
				);

				CREATE TABLE users (
					id            VARCHAR(25)  NOT NULL PRIMARY KEY,
					created_at    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					email         TEXT         NOT NULL UNIQUE,
					name          TEXT         NOT NULL,
					password_hash TEXT         NOT NULL
				);

				CREATE TABLE sessions (
					id         VARCHAR(25)  NOT NULL PRIMARY KEY,
					created_at TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					user_id    VARCHAR(25)  NOT NULL REFERENCES users ON DELETE CASCADE
				);

				CREATE TABLE blog_posts (
					id          VARCHAR(25)  NOT NULL PRIMARY KEY,
					created_at  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					updated_at  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					user_id     VARCHAR(25)  REFERENCES users ON DELETE SET NULL,
					content     TEXT         NOT NULL,
					date        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					edited_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					image       TEXT         NOT NULL,
					published   BOOLEAN      NOT NULL DEFAULT FALSE,
					score       INTEGER      NOT NULL DEFAULT 0,
					shares      INTEGER      NOT NULL DEFAULT 0,
					slug        TEXT         NOT NULL UNIQUE,
					stage       INTEGER      NOT NULL DEFAULT 0,
					tags        TEXT         NOT NULL DEFAULT '',
					title       TEXT         NOT NULL,
					unlisted    BOOLEAN      NOT NULL DEFAULT FALSE,
					views       INTEGER      NOT NULL DEFAULT 0,
					votes_total INTEGER      NOT NULL DEFAULT 0,
					votes_users INTEGER      NOT NULL DEFAULT 0
				);

				CREATE TABLE newsletter_subscribers (
					id           VARCHAR(25)  NOT NULL PRIMARY KEY,
					created_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					updated_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					email        TEXT         NOT NULL UNIQUE,
					name         TEXT         NOT NULL,
					unsubscribed BOOLEAN      NOT NULL DEFAULT FALSE
				);

				CREATE TABLE newsletter_sends (
					id          VARCHAR(25)  NOT NULL PRIMARY KEY,
					created_at  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
					description TEXT         NOT NULL DEFAULT '',
					key         TEXT         NOT NULL UNIQUE,
					recipients  INTEGER      NOT NULL
				);
			`)
			return err
		},
		Reverse: func(ctx context.Context, db *sqlx.DB) error {
			_, err := db.Exec(`
				-- Too dangerous to leave in here
				-- DROP TABLE if EXISTS projects CASCADE;
				-- DROP TABLE if EXISTS favorite_thingss CASCADE;
				-- DROP TABLE if EXISTS books CASCADE;
				-- DROP TABLE if EXISTS users CASCADE;
				-- DROP TABLE if EXISTS sessions CASCADE;
				-- DROP TABLE if EXISTS blog_posts CASCADE;
				-- DROP TABLE if EXISTS subscribers CASCADE;
				-- DROP TABLE if EXISTS newsletter_sends CASCADE;
			`)

			return err
		},
	})
}
