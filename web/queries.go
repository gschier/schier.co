package web

import (
	"github.com/gschier/schier.dev/generated/prisma-client"
	"time"
)

func RecentBlogPosts(age time.Duration, ignoreID *string) *prisma.BlogPostsParams {
	orderBy := prisma.BlogPostOrderByInputDateDesc
	return &prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			IDNot:     ignoreID,
			Published: prisma.Bool(true),
			Unlisted:  prisma.Bool(false),
			DateGte:   prisma.Str(time.Now().Add(-age).Format(time.RFC3339)),
		},
		OrderBy: &orderBy,
	}
}

func RecommendedBlogPosts(limit int32, ignoreID *string) *prisma.BlogPostsParams {
	orderBy := prisma.BlogPostOrderByInputScoreDesc
	return &prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			IDNot:     ignoreID,
			Published: prisma.Bool(true),
			Unlisted:  prisma.Bool(false),
		},
		First:   prisma.Int32(limit),
		OrderBy: &orderBy,
	}
}
