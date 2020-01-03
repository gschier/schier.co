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
	"net/url"
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
	router.HandleFunc("/blog/drafts", Admin(routeBlogDrafts)).Methods(http.MethodGet)
	router.HandleFunc("/blog", routeBlogList).Methods(http.MethodGet)
	router.HandleFunc("/blog/page/{page:[0-9]+}", routeBlogList).Methods(http.MethodGet)

	// Tags
	router.HandleFunc("/blog/tags", routeBlogTags).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}/share/{platform}", routeBlogShare).Methods(http.MethodGet)
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
	router.HandleFunc("/forms/blog/unlist", Admin(routeBlogPostUnlist)).Methods(http.MethodPost)

	// API
	router.HandleFunc("/api/blog/assets", Admin(routeUploadAsset)).Methods(http.MethodPut)
	router.HandleFunc("/api/blog/vote", routeVote).Methods(http.MethodPost)
}

var blogEditTemplate = pageTemplate("blog/edit.html")
var blogListTemplate = pageTemplate("blog/list.html")
var blogDraftsTemplate = pageTemplate("blog/drafts.html")
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

func routeBlogPostUnlist(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	client := ctxPrismaClient(r)

	blogPost, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{
		ID: &id,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	blogPost, err = client.UpdateBlogPost(prisma.BlogPostUpdateParams{
		Data:  prisma.BlogPostUpdateInput{Unlisted: prisma.Bool(!blogPost.Unlisted)},
		Where: prisma.BlogPostWhereUniqueInput{ID: &id},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to unlist Post", err)
		http.Error(w, "Failed to unlist Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+blogPost.Slug, http.StatusSeeOther)
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
	stage := StrToInt32(r.Form.Get("stage"), 0)

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
		log.Println("Failed to update blog post", err.Error())
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	// Upsert blog post
	// NOTE: Note using prisma upsert method because updating date is conditional
	var upsertErr error
	var newPost *prisma.BlogPost = nil
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

		newPost, upsertErr = client.UpdateBlogPost(prisma.BlogPostUpdateParams{
			Where: prisma.BlogPostWhereUniqueInput{
				ID: &id,
			},
			Data: prisma.BlogPostUpdateInput{
				Slug:    &slug,
				Title:   &title,
				Content: &content,
				Image:   &image,
				Date:    &date,
				Stage:   &stage,
				Tags:    prisma.Str(TagsToString(tagNames)),
			},
		}).Exec(r.Context())
	} else {
		newPost, upsertErr = client.CreateBlogPost(prisma.BlogPostCreateInput{
			Published: false,
			Title:     title,
			Content:   content,
			Image:     image,
			Stage:     stage,
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

	http.Redirect(w, r, "/blog/"+newPost.Slug, http.StatusSeeOther)
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

	recommendedBlogPosts, err := client.BlogPosts(RecommendedBlogPosts(5, &post.ID)).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch recent blog posts: " + err.Error())
		http.Error(w, "Failed to fetch recent blog posts", http.StatusInternalServerError)
		return
	}

	// Render template
	renderTemplate(w, r, blogPostTemplate(), &pongo2.Context{
		"pageTitle":            post.Title,
		"pageImage":            post.Image,
		"pageDescription":      Summary(post.Content),
		"blogPost":             post,
		"recommendedBlogPosts": recommendedBlogPosts,
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

func routeBlogDrafts(w http.ResponseWriter, r *http.Request) {
	// Fetch blog posts
	draftsOrderBy := prisma.BlogPostOrderByInputStageDesc
	drafts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
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

	// Fetch blog posts
	unlistedOrderBy := prisma.BlogPostOrderByInputUpdatedAtDesc
	unlisted, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Unlisted: prisma.Bool(true),
		},
		OrderBy: &unlistedOrderBy,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load unlisted posts", err)
		http.Error(w, "Failed to load unlisted posts", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, blogDraftsTemplate(), &pongo2.Context{
		"drafts":   drafts,
		"unlisted": unlisted,
	})
}

func routeBlogList(w http.ResponseWriter, r *http.Request) {
	// Redirect /blog = /blog/page/1
	if mux.Vars(r)["page"] == "" && mux.Vars(r)["tag"] == "" {
		http.Redirect(w, r, "/blog/page/1", http.StatusSeeOther)
		return
	}

	tag := mux.Vars(r)["tag"]
	page := StrToInt(mux.Vars(r)["page"], 1)

	first := 5
	skip := (page - 1) * first

	// Show all for tags
	if tag != "" {
		first = 999
		skip = 0
	}

	var tagsContains *string = nil
	var tagsEqual *string = nil
	if tag == "-" {
		tagsEqual = prisma.Str("||")
	} else if tag != "" {
		tagsContains = prisma.Str(TagsToString([]string{tag}))
	}

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputDateDesc
	blogPosts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Published:    prisma.Bool(true),
			Unlisted:     prisma.Bool(false),
			TagsContains: tagsContains,
			Tags:         tagsEqual,
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

	description := "An archive of blog posts"
	title := "Blog"
	if tag != "" {
		description += " for tag " + tag
		title += " " + tag + " Tag"
	}
	if page > 1 {
		description += fmt.Sprintf(" (page %d)", page)
		title += fmt.Sprintf(" (Page %d)", page)
	}

	// Render template
	renderTemplate(w, r, blogListTemplate(), &pongo2.Context{
		"pageTitle":       title,
		"pageDescription": description,
		"tag":             tag,
		"blogPosts":       blogPosts,
		"blogPage":        page,
		"blogPagePrev":    pagePrevious,
		"blogPageNext":    pageNext,
	})
}

func routeVote(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	count := StrToInt32(r.Form.Get("count"), 0)
	slug := r.Form.Get("slug")

	client := ctxPrismaClient(r)

	post, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to get blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	// Don't allow these conditions to vote
	if count > 50 || !post.Published {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Only increment user on first vote
	var userInc int32 = 0
	if count == 0 {
		userInc = 1
	}

	newPost, err := client.UpdateBlogPost(prisma.BlogPostUpdateParams{
		Data: prisma.BlogPostUpdateInput{
			VotesTotal: prisma.Int32(post.VotesTotal + 1),
			VotesUsers: prisma.Int32(post.VotesUsers + userInc),
		},
		Where: prisma.BlogPostWhereUniqueInput{ID: &post.ID},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to vote", err)
		http.Error(w, "Failed to vote", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(fmt.Sprintf("%d", newPost.VotesTotal)))
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

func routeBlogShare(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	platform := mux.Vars(r)["platform"]

	client := ctxPrismaClient(r)

	post, err := client.BlogPost(prisma.BlogPostWhereUniqueInput{
		Slug: &slug,
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	postURL := url.PathEscape(fmt.Sprintf("%s/blog/%s", os.Getenv("BASE_URL"), post.Slug))
	title := url.PathEscape(Summary(post.Title))

	var shareUrl string
	switch platform {
	case "twitter":
		shareUrl = fmt.Sprintf("https://twitter.com/share?url=%s&text=%s&via=GregorySchier", postURL, title)
	case "hn":
		shareUrl = fmt.Sprintf("https://news.ycombinator.com/submitlink?u=%s&t=%s", postURL, title)
	case "reddit":
		shareUrl = fmt.Sprintf("https://reddit.com/submit?url=%s&title=%s", postURL, title)
	case "email":
		shareUrl = fmt.Sprintf("mailto:?subject=%s&body=%s", postURL, title)
	}

	http.Redirect(w, r, shareUrl, http.StatusSeeOther)
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
