package schier_dev

import (
	"context"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/gschier/schier.dev/web"
	"golang.org/x/crypto/bcrypt"
	"gopkg.in/yaml.v2"
	"io/ioutil"
	"log"
	"os"
	"path"
	"strings"
)

func InstallFixtures(client *prisma.Client) {
	count := 0
	count += processUsers(client)
	count += processProjects(client)
	count += processFavoriteThings(client)
	count += processBooks(client)

	//count += processBlogPosts(client)
	//count += backfillBlogPosts(client, "./oldcontent")

	log.Printf("Installed %d fixtures\n", count)
}

func processUsers(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/users.yaml")
	if err != nil {
		panic(err)
	}

	var users []*prisma.User
	err = yaml.Unmarshal(b, &users)
	if err != nil {
		panic(err)
	}

	for _, u := range users {
		pwdHash, _ := bcrypt.GenerateFromPassword([]byte(os.Getenv("USER_PASSWORD")), bcrypt.DefaultCost)
		_, err := client.UpsertUser(prisma.UserUpsertParams{
			Where: prisma.UserWhereUniqueInput{
				Email: &u.Email,
			},
			Create: prisma.UserCreateInput{
				Type:         &u.Type,
				Email:        u.Email,
				Name:         u.Name,
				PasswordHash: string(pwdHash),
			},
			Update: prisma.UserUpdateInput{
				Type:         &u.Type,
				Email:        &u.Email,
				Name:         &u.Name,
				PasswordHash: prisma.Str(string(pwdHash)),
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(users)
}

func processFavoriteThings(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/favorite-things.yaml")
	if err != nil {
		panic(err)
	}

	var favoriteThings []*prisma.FavoriteThing
	err = yaml.Unmarshal(b, &favoriteThings)
	if err != nil {
		panic(err)
	}

	for i, p := range favoriteThings {
		priority := int32(i)
		_, err := client.UpsertFavoriteThing(prisma.FavoriteThingUpsertParams{
			Where: prisma.FavoriteThingWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.FavoriteThingCreateInput{
				Priority:    priority,
				ID:          &p.ID,
				Name:        p.Name,
				Link:        p.Link,
				Description: p.Description,
			},
			Update: prisma.FavoriteThingUpdateInput{
				Priority:    prisma.Int32(priority),
				Name:        &p.Name,
				Link:        &p.Link,
				Description: &p.Description,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(favoriteThings)
}

func processBooks(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/books.yaml")
	if err != nil {
		panic(err)
	}

	var books []*prisma.Book
	err = yaml.Unmarshal(b, &books)
	if err != nil {
		panic(err)
	}

	for _, p := range books {
		_, err := client.UpsertBook(prisma.BookUpsertParams{
			Where: prisma.BookWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.BookCreateInput{
				ID:     &p.ID,
				Rank:   p.Rank,
				Title:  p.Title,
				Author: p.Author,
				Link:   p.Link,
			},
			Update: prisma.BookUpdateInput{
				Title:  &p.Title,
				Author: &p.Author,
				Rank:   p.Rank,
				Link:   p.Link,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(books)
}

func processProjects(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/projects.yaml")
	if err != nil {
		panic(err)
	}

	var projects []*prisma.Project
	err = yaml.Unmarshal(b, &projects)
	if err != nil {
		panic(err)
	}

	for i, p := range projects {
		priority := int32(i)
		_, err := client.UpsertProject(prisma.ProjectUpsertParams{
			Where: prisma.ProjectWhereUniqueInput{
				ID: &p.ID,
			},
			Create: prisma.ProjectCreateInput{
				Priority:    priority,
				ID:          &p.ID,
				Name:        p.Name,
				Link:        p.Link,
				Icon:        p.Icon,
				Description: p.Description,
				Retired:     p.Retired,
				Revenue:     p.Revenue,
				Reason:      p.Reason,
			},
			Update: prisma.ProjectUpdateInput{
				Priority:    prisma.Int32(priority),
				Name:        &p.Name,
				Link:        &p.Link,
				Icon:        &p.Icon,
				Description: &p.Description,
				Retired:     &p.Retired,
				Revenue:     &p.Revenue,
				Reason:      p.Reason,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(projects)
}

func processBlogPosts(client *prisma.Client) int {
	b, err := ioutil.ReadFile("fixtures/blog-posts.yaml")
	if err != nil {
		panic(err)
	}

	var blogPosts []*prisma.BlogPost
	err = yaml.Unmarshal(b, &blogPosts)
	if err != nil {
		panic(err)
	}

	for _, p := range blogPosts {
		_, err := client.UpsertBlogPost(prisma.BlogPostUpsertParams{
			Where: prisma.BlogPostWhereUniqueInput{
				Slug: &p.Slug,
			},
			Create: prisma.BlogPostCreateInput{
				ID:        nil,
				Published: p.Published,
				Deleted:   p.Deleted,
				Slug:      p.Slug,
				Title:     p.Title,
				Date:      p.Date,
				Content:   p.Content,
				Tags:      p.Tags,
				Author: prisma.UserCreateOneInput{
					Connect: &prisma.UserWhereUniqueInput{
						Email: prisma.Str("gschier1990@gmail.com"),
					},
				},
			},
			Update: prisma.BlogPostUpdateInput{
				Published: &p.Published,
				Deleted:   &p.Deleted,
				Title:     &p.Title,
				Date:      &p.Date,
				Content:   &p.Content,
				Tags:      &p.Tags,
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
	}

	return len(blogPosts)
}

func backfillBlogPosts(client *prisma.Client, dir string) int {
	type post struct {
		Title string   `json:"title"`
		Slug  string   `json:"slug"`
		Date  string   `json:"date"`
		URL   string   `json:"url"`
		Tags  []string `json:"tags"`
	}

	infos, _ := ioutil.ReadDir(dir)

	count := 0
	for _, info := range infos {
		fullPath := path.Join(dir, info.Name())
		if info.IsDir() {
			count += backfillBlogPosts(client, fullPath)
			continue
		}

		b, _ := ioutil.ReadFile(fullPath)
		var p post
		_ = yaml.Unmarshal(b, &p)
		str := string(b)
		body := strings.TrimSpace(strings.SplitN(str, "---", 3)[2])
		if !strings.Contains(body, "<!--more-->") {
			body = strings.Replace(body, "\n\n", "\n\n<!--more-->\n\n", 1)
		}
		_, err := client.UpsertBlogPost(prisma.BlogPostUpsertParams{
			Where: prisma.BlogPostWhereUniqueInput{
				Slug: &p.Slug,
			},
			Create: prisma.BlogPostCreateInput{
				Published: true,
				Deleted:   false,
				Slug:      p.Slug,
				Title:     p.Title,
				Date:      p.Date,
				Content:   body,
				Tags:      web.TagsToString(p.Tags),
				Author: prisma.UserCreateOneInput{
					Connect: &prisma.UserWhereUniqueInput{
						Email: prisma.Str("gschier1990@gmail.com"),
					},
				},
			},
			Update: prisma.BlogPostUpdateInput{
				Published: prisma.Bool(true),
				Deleted:   prisma.Bool(false),
				Slug:      prisma.Str(p.Slug),
				Title:     prisma.Str(p.Title),
				Date:      prisma.Str(p.Date),
				Content:   prisma.Str(body),
				Tags:      prisma.Str(web.TagsToString(p.Tags)),
				Author: &prisma.UserUpdateOneRequiredInput{
					Connect: &prisma.UserWhereUniqueInput{
						Email: prisma.Str("gschier1990@gmail.com"),
					},
				},
			},
		}).Exec(context.Background())
		if err != nil {
			panic(err)
		}
		count++
	}

	return count
}
