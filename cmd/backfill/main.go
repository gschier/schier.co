package main

import (
	"context"
	schier "github.com/gschier/schier.dev"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"regexp"
	"strings"
)

func main() {
	client := schier.NewPrismaClient()

	orderBy := prisma.BlogPostOrderByInputDateDesc
	posts, err := client.BlogPosts(&prisma.BlogPostsParams{
		OrderBy: &orderBy,
	}).Exec(context.Background())
	if err != nil {
		panic(err)
	}

	imgRegex := regexp.MustCompile(`!\[.+]\((.+?)( ".*")?\)`)
	for _, post := range posts {
		log.Println("[Backfill] Checking post", post.Slug)
		for _, match := range imgRegex.FindAllStringSubmatch(post.Content, -1) {
			if match == nil {
				continue
			}

			if !strings.HasPrefix(match[1], "/") {
				log.Println("[Backfill] Skipping absolute image", match[1])
				continue
			}

			newImgStr := strings.Replace(match[0], match[1], "https://assets.schier.dev"+match[1], 1)
			log.Println("[Backfill] Switched image from", match[1], "to", newImgStr)

			post.Content = strings.Replace(post.Content, match[0], newImgStr, 1)
		}

		_, err = client.UpdateBlogPost(prisma.BlogPostUpdateParams{
			Data:  prisma.BlogPostUpdateInput{Content: &post.Content},
			Where: prisma.BlogPostWhereUniqueInput{ID: &post.ID},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}

		log.Println("[Backfill] Saved post", post.Slug)
	}
}
