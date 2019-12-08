package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/feeds"
	"github.com/gorilla/mux"
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
	router.HandleFunc("/blog", routeBlogList).Methods(http.MethodGet)
	router.HandleFunc("/blog/new", renderHandler("blog/edit.html", nil)).Methods(http.MethodGet)
	router.HandleFunc("/blog/render", routeBlogRender).Methods(http.MethodPost)

	// Tags
	router.HandleFunc("/blog/tags", routeBlogTags).Methods(http.MethodGet)
	router.HandleFunc("/blog/tags/{tag}", routeBlogList).Methods(http.MethodGet)

	// Posts
	router.HandleFunc("/blog/{page:[0-9]+}", routeBlogList).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}.html", routeBlogPostSuffix).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}", routeBlogPost).Methods(http.MethodGet)
	router.HandleFunc("/blog/{year}/{month}/{day}/{slug}", routeBlogPostYMD).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}/edit", routeBlogPostEdit).Methods(http.MethodGet)

	// Forms
	router.HandleFunc("/forms/blog/upsert", routeBlogPostCreateOrUpdate).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/publish", routeBlogPostPublish).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/delete", routeBlogPostDelete).Methods(http.MethodPost)
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
			Deleted:   prisma.Bool(false),
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
		for _, newTag := range stringToTags(p.Tags) {
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
		"tags": tags,
	})
}

func routeBlogRender(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseMultipartForm(0)

	content := r.Form.Get("content")

	// Replace Windows line ending because Blackfriday doesn't handle them
	slug := r.Form.Get("slug")
	title := r.Form.Get("title")
	partial := r.Form.Get("partial") == "true"
	date := r.Form.Get("date")

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
		"loggedIn": false,
		"words":    strings.Count(content, " "),
		"blogPost": prisma.BlogPost{
			Published: true,
			Slug:      slug,
			Title:     title,
			Date:      date,
			Content:   content,
		},
	})
}

func routeBlogPostDelete(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	client := ctxPrismaClient(r)
	blogPost, err := client.UpdateBlogPost(prisma.BlogPostUpdateParams{
		Data:  prisma.BlogPostUpdateInput{Deleted: prisma.Bool(true)},
		Where: prisma.BlogPostWhereUniqueInput{ID: &id},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to delete Post", err)
		http.Error(w, "Failed to delete Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+blogPost.Slug, http.StatusSeeOther)
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

	baseQuery := ctxPrismaClient(r).BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug})

	// Fetch blog posts
	blogPost, err := baseQuery.Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, blogEditTemplate(), &pongo2.Context{"blogPost": blogPost})
}

func routeBlogPostCreateOrUpdate(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")
	slug := r.Form.Get("slug")
	content := r.Form.Get("content")
	title := r.Form.Get("title")
	published := r.Form.Get("published") == "true"
	tagNames := stringToTags(r.Form.Get("tags"))

	client := ctxPrismaClient(r)
	loggedIn := ctxGetLoggedIn(r)
	user := ctxGetUser(r)

	if !loggedIn {
		routeNotFound(w, r)
		return
	}

	// Upsert blog post
	_, err := client.UpsertBlogPost(prisma.BlogPostUpsertParams{
		Where: prisma.BlogPostWhereUniqueInput{ID: &id},
		Create: prisma.BlogPostCreateInput{
			Slug:      slug,
			Title:     title,
			Published: published,
			Content:   content,
			Date:      time.Now().Format(time.RFC3339),
			Author:    prisma.UserCreateOneInput{Connect: &prisma.UserWhereUniqueInput{ID: &user.ID}},
			Tags:      TagsToString(tagNames),
		},
		Update: prisma.BlogPostUpdateInput{
			Slug:    &slug,
			Title:   &title,
			Content: &content,
			Tags:    prisma.Str(TagsToString(tagNames)),
		},
	}).Exec(r.Context())
	if err != nil {
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

	loggedIn := ctxGetLoggedIn(r)

	blogPostWhere := &prisma.BlogPostWhereInput{Slug: &slug}

	// Don't show deleted posts to guests
	if !loggedIn {
		blogPostWhere.Deleted = prisma.Bool(false)
	}

	// Fetch post
	blogPosts, err := ctxPrismaClient(r).BlogPosts(
		&prisma.BlogPostsParams{Where: blogPostWhere},
	).Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}
	if len(blogPosts) == 0 {
		routeNotFound(w, r)
		return
	}

	// Render template
	renderTemplate(w, r, blogPostTemplate(), &pongo2.Context{
		"blogPost": blogPosts[0],
		"words":    strings.Count(blogPosts[0].Content, " "),
	})
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
		Where: &prisma.BlogPostWhereInput{
			Deleted:   prisma.Bool(false),
			Published: prisma.Bool(true),
		},
		OrderBy: &orderBy,
		First:   prisma.Int32(int32(count)),
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	feedUpdated, _ := time.Parse(time.RFC3339, blogPosts[0].Date)
	feedCreated, _ := time.Parse(time.RFC3339, blogPosts[len(blogPosts)-1].Date)

	feed := &feeds.Feed{
		Updated:     feedUpdated,
		Created:     feedCreated,
		Title:       "Gregory Schier",
		Subtitle:    "Hey there, I'm Greg!",
		Description: "Recent content from me",
		Copyright:   "Gregory Schier",
		Items:       make([]*feeds.Item, len(blogPosts)),
		Author:      &feeds.Author{Name: "Gregory Schier"},
		Link:        &feeds.Link{Href: os.Getenv("BASE_URL") + "/blog"},
		Image: &feeds.Image{
			Url:    os.Getenv("STATIC_URL") + "/favicon/android-chrome-512x512.png",
			Width:  200,
			Height: 200,
		},
	}

	for i, blogPost := range blogPosts {
		updated, _ := time.Parse(time.RFC3339, blogPost.Date)
		created, _ := time.Parse(time.RFC3339, blogPost.CreatedAt)
		feed.Items[i] = &feeds.Item{
			Title:   strings.Replace(blogPost.Title, "–", "&ndash;", -1),
			Id:      blogPost.ID,
			Updated: updated,
			Created: created,
			Content: RenderMarkdownStr(blogPost.Content),
			Link:    &feeds.Link{Href: os.Getenv("BASE_URL") + "/blog/" + blogPost.Slug},
			Author: &feeds.Author{
				Name: "Gregory Schier",
			},
		}
	}

	w.Header().Set("Content-Type", "application/xml")
	rss, err := feed.ToRss()

	_, _ = w.Write([]byte(rss))
}

func routeBlogList(w http.ResponseWriter, r *http.Request) {
	tag := mux.Vars(r)["tag"]
	page, _ := strconv.Atoi(mux.Vars(r)["page"])

	first := 8
	skip := page * first

	var tagsContains *string = nil
	if tag != "" {
		tagsContains = prisma.Str(TagsToString([]string{tag}))
	}

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputCreatedAtDesc
	blogPosts, err := ctxPrismaClient(r).BlogPosts(&prisma.BlogPostsParams{
		Where: &prisma.BlogPostWhereInput{
			Deleted:      prisma.Bool(false),
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

	pageNext := page
	pagePrevious := page
	if len(blogPosts) > first {
		pageNext++
	}
	if page > 0 {
		pagePrevious--
	}

	// Remove the n+1 post if it's there
	if len(blogPosts) > first {
		blogPosts = blogPosts[:len(blogPosts)-1]
	}

	// Render template
	renderTemplate(w, r, blogListTemplate(), &pongo2.Context{
		"tag":               tag,
		"blogPosts":         blogPosts,
		"blogsPage":         page,
		"blogsPageFriendly": page + 1,
		"blogsPagePrev":     pagePrevious,
		"blogsPageNext":     pageNext,
	})
}

func TagsToString(tags []string) string {
	for i, t := range tags {
		tags[i] = strings.ToLower(strings.TrimSpace(t))
	}

	return "|" + strings.Join(tags, "|") + "|"
}

func stringToTags(tags string) []string {
	tags = strings.TrimPrefix(tags, "|")
	tags = strings.TrimSuffix(tags, "|")

	allTags := strings.Split(tags, "|")
	for i, t := range allTags {
		allTags[i] = strings.ToLower(strings.TrimSpace(t))
	}

	return allTags
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
