package web

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/feeds"
	"github.com/gorilla/mux"
	sluglib "github.com/gosimple/slug"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

func BlogRoutes(router *mux.Router) {
	// RSS
	router.Handle("/rss.xml", http.RedirectHandler("/blog/rss.xml", http.StatusSeeOther)).Methods(http.MethodGet)
	router.HandleFunc("/blog/rss.xml", routeBlogRSS).Methods(http.MethodGet)

	// Blog Static
	router.HandleFunc("/blog/new", Admin(routeBlogPostEdit)).Methods(http.MethodGet)
	router.HandleFunc("/blog/render", routeBlogRender).Methods(http.MethodPost)
	router.Handle("/blog", http.RedirectHandler("/blog/page/1", http.StatusSeeOther)).Methods(http.MethodGet)
	router.HandleFunc("/blog/page/{page:[0-9]+}", routeBlogList).Methods(http.MethodGet)

	// Tags
	router.HandleFunc("/blog/tags", routeBlogTags).Methods(http.MethodGet)
	router.HandleFunc("/blog/tags/{tag}", routeBlogList).Methods(http.MethodGet)

	// Posts
	router.HandleFunc("/blog/{slug}.html", routeBlogPostSuffix).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}", routeBlogPost).Methods(http.MethodGet)
	router.HandleFunc("/blog/{year}/{month}/{day}/{slug}", routeBlogPostYMD).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}/edit", Admin(routeBlogPostEdit)).Methods(http.MethodGet)

	// Forms
	router.HandleFunc("/forms/blog/upsert", Admin(routeBlogPostCreateOrUpdate)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/publish", Admin(routeBlogPostPublish)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/delete", Admin(routeBlogPostDelete)).Methods(http.MethodPost)

	// API
	router.HandleFunc("/api/blog/assets", Admin(routeUploadAsset)).Methods(http.MethodPut)
}

var blogEditTemplate = pageTemplate("blog/edit.html")
var blogListTemplate = pageTemplate("blog/list.html")
var blogPostTemplate = pageTemplate("blog/post.html")
var blogTagsTemplate = pageTemplate("blog/tags.html")
var blogPostPartial = partialTemplate("blog_post.html")

func routeBlogTags(w http.ResponseWriter, r *http.Request) {
	client := ctxPrismaClient(r)
	blogPosts, err := client.BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Published: prisma.Bool(true),
			TagsNot:   prisma.Str(""),
		},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to query Posts", err)
		http.Error(w, "Failed to query Posts", http.StatusInternalServerError)
		return
	}

	tagsMap := make(map[string]int, 0)
	for _, p := range blogPosts {
		for _, newTag := range StringToTags(p.Tags) {
			if newTag == "" {
				continue
			}

			if _, ok := tagsMap[newTag]; !ok {
				tagsMap[newTag] = 0
			}

			tagsMap[newTag]++
		}
	}

	tags := make([]postTag, 0)
	for tag, count := range tagsMap {
		tags = append(tags, postTag{
			Name:  tag,
			Count: count,
		})
	}

	sort.Sort(ByTag(tags))
	renderTemplate(w, r, blogTagsTemplate(), &pongo2.Context{
		"pageTitle":       "Post Tags",
		"pageDescription": "Browse blog posts by tag category",
		"tags":            tags,
	})
}

func routeBlogRender(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseMultipartForm(0)

	content := r.Form.Get("content")

	// Replace Windows line ending because BlackFriday doesn't handle them
	slug := r.Form.Get("slug")
	title := r.Form.Get("title")
	partial := r.Form.Get("partial") == "true"
	date := r.Form.Get("date")
	tags := NormalizeTags(r.Form.Get("tags"))

	if date == "" {
		date = time.Now().Format(time.RFC3339)
	}

	var template *pongo2.Template
	if partial {
		template = blogPostPartial()
	} else {
		template = blogPostTemplate()
	}

	renderTemplate(w, r, template, &pongo2.Context{
		"loggedIn":      false,
		"pageTitle":     title,
		"showWordCount": true,
		"blogPost": prisma.BlogPost{
			Published: true,
			Slug:      slug,
			Title:     title,
			Date:      date,
			Content:   content,
			Tags:      tags,
		},
	})
}

func routeBlogPostDelete(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	client := ctxPrismaClient(r)
	_, err := client.DeleteBlogPost(prisma.BlogPostWhereUniqueInput{
		ID: &id,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to delete Post", err)
		http.Error(w, "Failed to delete Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog", http.StatusSeeOther)
}

func routeBlogPostPublish(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	published := r.Form.Get("published") == "true"
	id := r.Form.Get("id")

	client := ctxPrismaClient(r)
	blogPost, err := client.UpdateBlogPost(prisma.BlogPostUpdateParams{
		Data:  prisma.BlogPostUpdateInput{Published: &published},
		Where: prisma.BlogPostWhereUniqueInput{ID: &id},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to publish Post", err)
		http.Error(w, "Failed to publsh Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+blogPost.Slug, http.StatusSeeOther)
}

func routeBlogPostEdit(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]

	// Slug won't exist if it's a new post
	if slug == "" {
		renderTemplate(w, r, blogEditTemplate(), nil)
		return
	}

	baseQuery := ctxPrismaClient(r).BlogPost(prisma.BlogPostWhereUniqueInput{
		Slug: &slug,
	})

	// Fetch blog posts
	blogPost, err := baseQuery.Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	// Convert tags to more editable format
	blogPost.Tags = TagsToComma(blogPost.Tags)

	renderTemplate(w, r, blogEditTemplate(), &pongo2.Context{
		"pageTitle": blogPost.Title,
		"pageImage": blogPost.Image,
		"blogPost":  blogPost,
	})
}

func routeBlogPostCreateOrUpdate(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")
	slug := r.Form.Get("slug")
	content := r.Form.Get("content")
	title := r.Form.Get("title")
	image := r.Form.Get("image")
	tagNames := StringToTags(r.Form.Get("tags"))

	// Force title capitalization
	title = CapitalizeTitle(title)

	// BlackFriday doesn't like Windows line endings
	content = strings.Replace(content, "\r\n", "\n", -1)

	client := ctxPrismaClient(r)
	loggedIn := ctxGetLoggedIn(r)
	user := ctxGetUser(r)

	if !loggedIn {
		routeNotFound(w, r)
		return
	}

	existingPost, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{ID: &id}).Exec(r.Context())
	if err != nil && err != prisma.ErrNoResult {
		log.Println("Failed to update blog posts", err)
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	// Upsert blog post
	// NOTE: Note using prisma upsert method because updating date is conditional
	var upsertErr error
	if existingPost != nil {
		date := existingPost.Date
		if !existingPost.Published {
			date = time.Now().Format(time.RFC3339)
		}

		if existingPost.Published {
			// Never update slug if published
			slug = existingPost.Slug
		} else if slug == "" {
			// Update slug if draft and no slug provided
			slug = sluglib.Make(title)
		}

		_, upsertErr = client.UpdateBlogPost(prisma.BlogPostUpdateParams{
			Where: prisma.BlogPostWhereUniqueInput{
				ID: &id,
			},
			Data: prisma.BlogPostUpdateInput{
				Slug:    &slug,
				Title:   &title,
				Content: &content,
				Image:   &image,
				Date:    &date,
				Tags:    prisma.Str(TagsToString(tagNames)),
			},
		}).Exec(r.Context())
	} else {
		_, upsertErr = client.CreateBlogPost(prisma.BlogPostCreateInput{
			Published: false,
			Title:     title,
			Content:   content,
			Image:     image,
			Slug:      sluglib.Make(title),
			Date:      time.Now().Format(time.RFC3339),
			Author:    prisma.UserCreateOneInput{Connect: &prisma.UserWhereUniqueInput{ID: &user.ID}},
			Tags:      TagsToString(tagNames),
		}).Exec(r.Context())
	}

	if upsertErr != nil {
		log.Println("Failed to update blog posts", err)
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+slug, http.StatusSeeOther)
}

func routeBlogPostYMD(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	slug = strings.TrimSuffix(slug, ".html")

	// Redirect away from year/month/day path. Just keeping this here for google
	http.Redirect(w, r, "/blog/"+slug, http.StatusFound)
}

func routeBlogPostSuffix(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	slug = strings.TrimSuffix(slug, ".html")

	// Redirect away from year/month/day path. Just keeping this here for google
	http.Redirect(w, r, "/blog/"+slug, http.StatusFound)
}

func routeBlogPost(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]

	client := ctxPrismaClient(r)
	loggedIn := ctxGetLoggedIn(r)

	blogPostWhere := &prisma.BlogPostWhereInput{Slug: &slug}

	// Fetch post
	oneBlogPosts, err := client.BlogPosts(
		&prisma.BlogPostsParams{Where: blogPostWhere},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}
	if len(oneBlogPosts) == 0 {
		routeNotFound(w, r)
		return
	}

	post := oneBlogPosts[0]

	recentBlogPosts, err := client.BlogPosts(RecentBlogPosts(4, &post.ID)).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch recent blog posts: " + err.Error())
		http.Error(w, "Failed to fetch recent blog posts", http.StatusInternalServerError)
		return
	}

	// Render template
	renderTemplate(w, r, blogPostTemplate(), &pongo2.Context{
		"pageTitle":       post.Title,
		"pageImage":       post.Image,
		"pageDescription": Summary(post.Content),
		"blogPost":        post,
		"recentBlogPosts": recentBlogPosts,
	})

	go func() {
		newViewCount := post.Views
		if !loggedIn {
			newViewCount += 1
		}
		_, err := client.UpdateBlogPost(prisma.BlogPostUpdateParams{
			Where: prisma.BlogPostWhereUniqueInput{
				ID: &post.ID,
			},
			Data: prisma.BlogPostUpdateInput{
				Views: prisma.Int32(newViewCount),
			},
		}).Exec(context.Background())
		if err != nil {
			log.Println("Failed to update blog post views", err.Error())
		}
	}()
}

func routeBlogRSS(w http.ResponseWriter, r *http.Request) {
	countStr := r.URL.Query().Get("limit")

	count := 20
	if countStr != "" {
		count, _ = strconv.Atoi(countStr)
	}

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputCreatedAtDesc
	blogPosts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where:   &prisma.BlogPostWhereInput{Published: prisma.Bool(true)},
		OrderBy: &orderBy,
		First:   prisma.Int32(int32(count)),
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	feedUpdated, _ := time.Parse(time.RFC3339, blogPosts[0].Date)

	feed := &feeds.Feed{
		Updated:     feedUpdated,
		Title:       "Gregory Schier",
		Subtitle:    "Blog posts",
		Description: "Recent content from me",
		Copyright:   "Gregory Schier",
		Items:       make([]*feeds.Item, len(blogPosts)),
		Author: &feeds.Author{
			Name:  "Gregory Schier",
			Email: "greg@schier.co",
		},
		Link: &feeds.Link{
			Href: os.Getenv("BASE_URL") + "/blog",
		},
		Image: &feeds.Image{
			Url:   os.Getenv("BASE_URL") + "/static/favicon/android-chrome-512x512.png",
			Link:  os.Getenv("BASE_URL") + "/blog",
			Title: "Gregory Schier",
		},
	}

	for i, blogPost := range blogPosts {
		created, _ := time.Parse(time.RFC3339, blogPost.Date)
		feed.Items[i] = &feeds.Item{
			Title:   strings.Replace(blogPost.Title, "–", "&ndash;", -1),
			Id:      os.Getenv("BASE_URL") + "/blog/" + blogPost.ID,
			Created: created,
			Content: RenderMarkdownStr(blogPost.Content),
			Link: &feeds.Link{
				Href: os.Getenv("BASE_URL") + "/blog/" + blogPost.Slug,
			},
			Author: &feeds.Author{
				Name:  "Gregory Schier",
				Email: "greg@schier.co",
			},
		}
	}

	w.Header().Set("Content-Type", "application/xml")
	rss, err := feed.ToRss()

	_, _ = w.Write([]byte(rss))
}

func routeBlogList(w http.ResponseWriter, r *http.Request) {
	tag := mux.Vars(r)["tag"]
	page := StrToInt(mux.Vars(r)["page"], 1)

	first := 5
	skip := (page - 1) * first

	var tagsContains *string = nil
	if tag != "" {
		tagsContains = prisma.Str(TagsToString([]string{tag}))
	}

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputDateDesc
	blogPosts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Published:    prisma.Bool(true),
			TagsContains: tagsContains,
		},
		OrderBy: &orderBy,
		Skip:    prisma.Int32(int32(skip)),
		First:   prisma.Int32(int32(first + 1)),
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	// Fetch blog posts
	draftsOrderBy := prisma.BlogPostOrderByInputUpdatedAtDesc
	blogPostDrafts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Published: prisma.Bool(false),
		},
		OrderBy: &draftsOrderBy,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog post blogPostDrafts", err)
		http.Error(w, "Failed to load blog posts blogPostDrafts", http.StatusInternalServerError)
		return
	}

	pageNext := page
	pagePrevious := page
	if len(blogPosts) > first {
		pageNext++
	}
	if page > 1 {
		pagePrevious--
	}

	// Remove the n+1 post if it's there
	if len(blogPosts) > first {
		blogPosts = blogPosts[:len(blogPosts)-1]
	}

	if len(blogPosts) == 0 {
		routeNotFound(w, r)
		return
	}

	description := "Blog posts"
	if tag != "" {
		description += " for tag " + tag
	}
	if page > 1 {
		description += fmt.Sprintf(" (page %d)", page)
	}

	// Render template
	renderTemplate(w, r, blogListTemplate(), &pongo2.Context{
		"pageTitle":       "Blog Posts",
		"pageDescription": description,
		"tag":             tag,
		"blogPosts":       blogPosts,
		"blogPostDrafts":  blogPostDrafts,
		"blogPage":        page,
		"blogPagePrev":    pagePrevious,
		"blogPageNext":    pageNext,
	})
}

func routeUploadAsset(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(1)
	if err != nil {
		panic(err)
	}

	// Read file
	f, fh, err := r.FormFile("file")
	if err != nil {
		panic(err)
	}

	uploadPath, err := uploadImage(
		f,
		fh.Header.Get("Content-Type"),
		fh.Filename,
		fh.Size,
	)
	if err != nil {
		panic(err)
	}

	body, _ := json.Marshal(struct{ URL string `json:"url"` }{
		URL: "https://assets.schier.dev/" + uploadPath,
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

type postTag struct {
	Name  string
	Count int
}

type ByTag []postTag

func (t ByTag) Len() int      { return len(t) }
func (t ByTag) Swap(i, j int) { t[i], t[j] = t[j], t[i] }
func (t ByTag) Less(i, j int) bool {
	if t[i].Count == t[j].Count {
		return t[i].Name > t[j].Name
	}

	return t[i].Count > t[j].Count
}
