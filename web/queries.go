package web

import "github.com/gschier/schier.dev/generated/prisma-client"

func RecentBlogPosts(limit int32, ignoreID *string) *prisma.BlogPostsParams {
	blogPostsOrderBy := prisma.BlogPostOrderByInputDateDesc
	return &prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			IDNot:     ignoreID,
			Published: prisma.Bool(true),
			Unlisted:  prisma.Bool(false),
		},
		First:   prisma.Int32(limit),
		OrderBy: &blogPostsOrderBy,
	}
}

func RecommendedBlogPosts(limit int32, ignoreID *string) *prisma.BlogPostsParams {
	blogPostsOrderBy := prisma.BlogPostOrderByInputVotesUsersDesc
	return &prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			IDNot:     ignoreID,
			Published: prisma.Bool(true),
			Unlisted:  prisma.Bool(false),
		},
		First:   prisma.Int32(limit),
		OrderBy: &blogPostsOrderBy,
	}
}
