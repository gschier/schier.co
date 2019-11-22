package web

import (
	"github.com/flosch/pongo2"
	"github.com/gorilla/mux"
	"github.com/gschier/schier.dev/generated/prisma-client"
	"github.com/russross/blackfriday/v2"
	"log"
	"net/http"
	"strings"
	"time"
)

func BlogRoutes(router *mux.Router) {
	router.HandleFunc("/blog", routeBlogList).Methods(http.MethodGet)
	router.HandleFunc("/blog/tags/{tag}", routeBlogList).Methods(http.MethodGet)
	router.HandleFunc("/blog/new", renderHandler("blog/edit.html", nil)).Methods(http.MethodGet)
	router.HandleFunc("/blog/render", routeBlogRender).Methods(http.MethodPost)
	router.HandleFunc("/blog/{slug}", routeBlogPost).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}/edit", routeBlogPostEdit).Methods(http.MethodGet)

	// Forms
	router.HandleFunc("/forms/blog/upsert", routeBlogPostCreateOrUpdate).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/publish", routeBlogPostPublish).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/delete", routeBlogPostDelete).Methods(http.MethodPost)
}

var blogEditTemplate = pageTemplate("blog/edit.html")
var blogListTemplate = pageTemplate("blog/list.html")
var blogPostTemplate = pageTemplate("blog/post.html")
var blogPostPartial = partialTemplate("blog_post.html")

func routeBlogRender(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseMultipartForm(0)

	content := r.Form.Get("content")
	slug := r.Form.Get("slug")
	title := r.Form.Get("title")
	date := r.Form.Get("date")
	partial := r.Form.Get("partial") == "true"

	// Render the Markdown so we can store it on the model
	renderedContent := string(blackfriday.Run([]byte(content)))

	var template *pongo2.Template
	if partial {
		template = blogPostPartial()
	} else {
		template = blogPostTemplate()
	}

	renderTemplate(w, r, template, &pongo2.Context{
		"loggedIn": false,
		"blogPost": prisma.BlogPost{
			Published:       true,
			Slug:            slug,
			Title:           title,
			Date:            date,
			Content:         content,
			RenderedContent: renderedContent,
		},
	})
}

func routeBlogPostDelete(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	client := ctxDB(r)
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

	client := ctxDB(r)
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

	baseQuery := ctxDB(r).BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug})

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

	client := ctxDB(r)
	loggedIn := ctxGetLoggedIn(r)
	user := ctxGetUser(r)

	if !loggedIn {
		http.NotFound(w, r)
		return
	}

	// Replace Windows line ending because Blackfriday doesn't handle them
	content = strings.Replace(content, "\r\n", "\n", -1)

	if !strings.Contains(content, "<!--more-->") {
		http.Error(w, "Please provide a <!--more--> tag", http.StatusBadRequest)
		return
	}

	// Render the Markdown so we can store it on the model
	renderedContent := string(blackfriday.Run([]byte(content)))

	// Upsert blog post
	_, err := client.UpsertBlogPost(prisma.BlogPostUpsertParams{
		Where: prisma.BlogPostWhereUniqueInput{ID: &id},
		Create: prisma.BlogPostCreateInput{
			Slug:            slug,
			Title:           title,
			Published:       published,
			Content:         content,
			RenderedContent: renderedContent,
			Date:            time.Now().Format(time.RFC3339),
			Author:          prisma.UserCreateOneInput{Connect: &prisma.UserWhereUniqueInput{ID: &user.ID}},
			Tags:            tagsToString(tagNames),
		},
		Update: prisma.BlogPostUpdateInput{
			Slug:            &slug,
			Title:           &title,
			Content:         &content,
			RenderedContent: &renderedContent,
			Tags:            prisma.Str(tagsToString(tagNames)),
		},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to update blog posts", err)
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+slug, http.StatusSeeOther)
}

func routeBlogPost(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]

	baseQuery := ctxDB(r).BlogPost(prisma.BlogPostWhereUniqueInput{Slug: &slug})

	// Fetch blog posts
	blogPost, err := baseQuery.Exec(r.Context())
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	// Render template
	renderTemplate(w, r, blogPostTemplate(), &pongo2.Context{
		"blogPost": blogPost,
	})
}

func routeBlogList(w http.ResponseWriter, r *http.Request) {
	tag := mux.Vars(r)["tag"]

	var tagsContains *string = nil
	if tag != "" {
		tagsContains = prisma.Str(tagsToString([]string{tag}))
	}

	// Fetch blog posts
	orderBy := prisma.BlogPostOrderByInputCreatedAtDesc
	blogPosts, err := ctxDB(r).BlogPosts(&prisma.BlogPostsParams{
		OrderBy: &orderBy,
		Where: &prisma.BlogPostWhereInput{
			Deleted:      prisma.Bool(false),
			TagsContains: tagsContains,
		},
	}).Exec(r.Context())
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	for i := 0; i < len(blogPosts); i++ {
		blogPosts[i].RenderedContent = strings.Split(
			blogPosts[i].RenderedContent,
			"<!--more-->",
		)[0]
	}

	// Render template
	renderTemplate(w, r, blogListTemplate(), &pongo2.Context{
		"blogPosts": blogPosts,
		"tag":       tag,
	})
}

func tagsToString(tags []string) string {
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
