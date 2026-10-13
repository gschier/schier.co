-- The tables as the Go site left them (migrations/0001 to 0006 at the repo
-- root), so a fresh local database matches production, where this
-- migration is marked applied with `prisma migrate resolve --applied`.

CREATE TABLE "users" (
    "id"            VARCHAR(25)  NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "email"         TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "password_hash" TEXT         NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE TABLE "sessions" (
    "id"         VARCHAR(25)  NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "user_id"    VARCHAR(25)  NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "blog_posts" (
    "id"          VARCHAR(25)  NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "user_id"     VARCHAR(25),
    "content"     TEXT         NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "edited_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "image"       TEXT         NOT NULL,
    "published"   BOOLEAN      NOT NULL DEFAULT FALSE,
    "score"       INTEGER      NOT NULL DEFAULT 0,
    "shares"      INTEGER      NOT NULL DEFAULT 0,
    "slug"        TEXT         NOT NULL,
    "stage"       INTEGER      NOT NULL DEFAULT 0,
    "title"       TEXT         NOT NULL,
    "unlisted"    BOOLEAN      NOT NULL DEFAULT FALSE,
    "views"       INTEGER      NOT NULL DEFAULT 0,
    "votes_total" INTEGER      NOT NULL DEFAULT 0,
    "votes_users" INTEGER      NOT NULL DEFAULT 0,
    "tags"        TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "donations"   INTEGER      NOT NULL DEFAULT 0,
    "summary"     TEXT         NOT NULL DEFAULT '',

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug"),
    CONSTRAINT "blog_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "newsletter_subscribers" (
    "id"           VARCHAR(25)  NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "email"        TEXT         NOT NULL,
    "name"         TEXT         NOT NULL,
    "unsubscribed" BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "newsletter_subscribers_email_key" UNIQUE ("email")
);

CREATE TABLE "newsletter_sends" (
    "id"          VARCHAR(25)  NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "description" TEXT         NOT NULL DEFAULT '',
    "key"         TEXT         NOT NULL,
    "recipients"  INTEGER      NOT NULL,

    CONSTRAINT "newsletter_sends_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "newsletter_sends_key_key" UNIQUE ("key")
);
