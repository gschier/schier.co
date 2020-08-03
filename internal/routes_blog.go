package internal

import (
	"encoding/json"
	"fmt"
	"github.com/flosch/pongo2"
	"github.com/gorilla/feeds"
	"github.com/gorilla/mux"
	slugLib "github.com/gosimple/slug"
	"github.com/mileusna/useragent"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	models "github.com/gschier/schier.co/internal/db"
)

func BlogRoutes(router *mux.Router) {
	// RSS
	router.Handle("/rss.xml", http.RedirectHandler("/blog/rss.xml", http.StatusSeeOther)).Methods(http.MethodGet)
	router.HandleFunc("/blog/rss.xml", renderBlogPostRSS).Methods(http.MethodGet)

	// Blog Static
	router.HandleFunc("/blog/new", Admin(renderBlogPostEditor)).Methods(http.MethodGet)
	router.HandleFunc("/blog/render", renderBlogPostPreview).Methods(http.MethodPost)
	router.HandleFunc("/blog/drafts", Admin(renderBlogPostDrafts)).Methods(http.MethodGet)
	router.HandleFunc("/blog", renderBlogPosts).Methods(http.MethodGet)
	router.HandleFunc("/blog/page/{page:[0-9]+}", renderBlogPosts).Methods(http.MethodGet)

	// Tags
	router.HandleFunc("/blog/tags", renderBlogPostTags).Methods(http.MethodGet)
	router.HandleFunc("/tags/{tag}", redirectBlogPostTagsOldPrefix).Methods(http.MethodGet)
	router.HandleFunc("/blog/tags/{tag}", renderBlogPosts).Methods(http.MethodGet)
	router.HandleFunc("/blog/share/{slug}/{platform}", routeBlogShare).Methods(http.MethodGet)
	router.HandleFunc("/blog/donate/{slug}", routeBlogDonate).Methods(http.MethodGet)

	// Posts
	router.HandleFunc("/blog/search", routeBlogPostSearch).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}.html", redirectBlogPostWithFileExtension).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}", renderBlogPost).Methods(http.MethodGet)
	router.HandleFunc("/post/{slug}", redirectBlogPostOldPrefix).Methods(http.MethodGet)
	router.HandleFunc("/blog/{year}/{month}/{day}/{slug}", redirectBlogPostYearMonthDay).Methods(http.MethodGet)
	router.HandleFunc("/blog/edit/{id}", Admin(renderBlogPostEditor)).Methods(http.MethodGet)

	// Forms
	router.HandleFunc("/forms/blog/upsert", Admin(formBlogPostCreateOrUpdate)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/publish", Admin(formBlogPostPublish)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/delete", Admin(formBlogPostDelete)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/unlist", Admin(formBlogPostUnlist)).Methods(http.MethodPost)

	// API
	router.HandleFunc("/api/blog/assets", Admin(routeUploadAsset)).Methods(http.MethodPut)
	router.HandleFunc("/api/blog/vote", routeVote).Methods(http.MethodPost)
}

var blogEditTemplate = pageTemplate("blog/edit.html")
var blogListTemplate = pageTemplate("blog/list.html")
var blogDraftsTemplate = pageTemplate("blog/drafts.html")
var blogPostTemplate = pageTemplate("blog/post.html")
var blogTagsTemplate = pageTemplate("blog/tags.html")
var searchTemplate = pageTemplate("blog/search.html")
var blogPostPartial = partialTemplate("blog_post.html")

func renderBlogPostTags(w http.ResponseWriter, r *http.Request) {
	db := ctxDB(r)
	blogPosts, err := db.AllPublicBlogPosts(r.Context())
	if err != nil {
		log.Println("Failed to query Posts", err)
		http.Error(w, "Failed to query Posts", http.StatusInternalServerError)
		return
	}

	tagsMap := make(map[string]int, 0)
	for _, p := range blogPosts {
		for _, newTag := range p.Tags {
			if newTag == "" {
				continue
			}

			if _, ok := tagsMap[newTag]; !ok {
				tagsMap[newTag] = 0
			}

			tagsMap[newTag]++
		}
	}

	type postTag struct {
		Name  string
		Count int
	}

	tags := make([]postTag, 0)
	for tag, count := range tagsMap {
		tags = append(tags, postTag{Name: tag, Count: count})
	}

	// Sort tags by highest count
	sort.Slice(tags, func(i, j int) bool {
		if tags[i].Count == tags[j].Count {
			return tags[i].Name > tags[j].Name
		}
		return tags[i].Count > tags[j].Count
	})

	renderTemplate(w, r, blogTagsTemplate(), &pongo2.Context{
		"pageTitle":       "Post Tags",
		"pageDescription": "Browse blog posts by tag category",
		"tags":            tags,
	})
}

func renderBlogPostPreview(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseMultipartForm(0)

	content := r.Form.Get("content")

	// Replace Windows line ending because BlackFriday doesn't handle them
	slug := r.Form.Get("slug")
	title := r.Form.Get("title")
	partial := r.Form.Get("partial") == "true"
	dateStr := r.Form.Get("date")
	tags := StringToTags(r.Form.Get("tags"))

	date := time.Now()
	if dateStr != "" {
		date, _ = time.Parse(time.RFC3339, dateStr)
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
		"hideVoteEgg":   true,
		"blogPost": models.BlogPost{
			Published: true,
			Slug:      slug,
			Title:     title,
			Date:      date,
			EditedAt:  date,
			Content:   content,
			Tags:      tags,
		},
	})
}

func formBlogPostUnlist(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	db := ctxDB(r)

	post, err := db.Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	post.Unlisted = !post.Unlisted
	err = db.Store.BlogPosts.Update(post)
	if err != nil {
		log.Println("Failed to unlist Post", err)
		http.Error(w, "Failed to unlist Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+post.Slug, http.StatusSeeOther)
}

func formBlogPostDelete(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	err := ctxDB(r).Store.BlogPosts.Filter(models.Where.BlogPost.ID.Eq(id)).Delete()
	if err != nil {
		log.Println("Failed to delete Post", err)
		http.Error(w, "Failed to delete Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog", http.StatusSeeOther)
}

func formBlogPostPublish(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	published := r.Form.Get("published") == "true"
	id := r.Form.Get("id")

	db := ctxDB(r)

	post, err := db.Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	post.Published = published
	err = db.Store.BlogPosts.Update(post)
	if err != nil {
		log.Println("Failed to publish Post", err)
		http.Error(w, "Failed to publish Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+post.Slug, http.StatusSeeOther)
}

func routeBlogPostSearch(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusInternalServerError)
		return
	}

	query := r.Form.Get("query")
	blogPosts, err := ctxDB(r).SearchPublishedBlogPosts(r.Context(), query, 20)
	if err != nil {
		log.Println("Search failed", err)
		http.Error(w, "Failed to search", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, searchTemplate(), &pongo2.Context{
		"results": blogPosts,
		"query":   query,
	})
}

func renderBlogPostEditor(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	// Slug won't exist if it's a new post
	if id == "" {
		renderTemplate(w, r, blogEditTemplate(), nil)
		return
	}

	// Fetch blog posts
	blogPost, err := ctxDB(r).Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, blogEditTemplate(), &pongo2.Context{
		"pageTitle": blogPost.Title,
		"pageImage": blogPost.Image,
		"blogPost":  blogPost,
	})
}

func formBlogPostCreateOrUpdate(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")
	slug := r.Form.Get("slug")
	content := r.Form.Get("content")
	image := r.Form.Get("image")
	tags := StringToTags(r.Form.Get("tags"))
	stage := StrToInt64(r.Form.Get("stage"), 0)
	title := CapitalizeTitle(r.Form.Get("title"))

	// BlackFriday doesn't like Windows line endings
	content = strings.Replace(content, "\r\n", "\n", -1)

	loggedIn := ctxGetLoggedIn(r)
	user := ctxGetUser(r)

	if !loggedIn {
		routeNotFound(w, r)
		return
	}

	db := ctxDB(r)
	existingPost, err := db.Store.BlogPosts.Get(id)
	if db.IsNoResult(err) {
		existingPost = nil
	} else if err != nil {
		log.Println("Failed to update blog post", err.Error())
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	// Upsert blog post
	// NOTE: Note using prisma upsert method because updating date is conditional
	var upsertErr error
	if existingPost != nil {
		if !existingPost.Published {
			existingPost.Date = time.Now()
		}

		if !existingPost.Published && slug != "" {
			// Only update slug if
			existingPost.Slug = slug
		} else if !existingPost.Published && slug == "" {
			// Update slug if draft and no slug provided
			existingPost.Slug = slugLib.Make(title)
		}

		existingPost.Title = title
		existingPost.Content = content
		existingPost.Image = image
		existingPost.Tags = tags
		existingPost.Stage = stage
		upsertErr = db.Store.BlogPosts.Update(existingPost)
	} else {
		existingPost, upsertErr = db.Store.BlogPosts.Insert(
			models.Set.BlogPost.ID(newID("pst_")),
			models.Set.BlogPost.Slug(slug),
			models.Set.BlogPost.Title(title),
			models.Set.BlogPost.Content(content),
			models.Set.BlogPost.Image(image),
			models.Set.BlogPost.UserID(user.ID),
			models.Set.BlogPost.Tags(tags),
			models.Set.BlogPost.Date(time.Now()),
			models.Set.BlogPost.Stage(stage),
		)
	}

	if upsertErr != nil {
		log.Println("Failed to update blog posts", upsertErr)
		http.Error(w, "Failed to update blog post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+existingPost.Slug, http.StatusSeeOther)
}

// redirectBlogPostTagsOldPrefix redirects to the new tag format /blog/tags/:tag
func redirectBlogPostTagsOldPrefix(w http.ResponseWriter, r *http.Request) {
	tag := mux.Vars(r)["tag"]
	http.Redirect(w, r, "/blog/tags/"+tag, http.StatusMovedPermanently)
}

// redirectBlogPostOldPrefix redirects to the new /blog/:slug format
func redirectBlogPostOldPrefix(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	http.Redirect(w, r, "/blog/"+slug, http.StatusMovedPermanently)
}

// redirectBlogPostYearMonthDay redirects to new post format
func redirectBlogPostYearMonthDay(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	slug = strings.TrimSuffix(slug, ".html")

	// Redirect away from year/month/day path. Just keeping this here for google
	http.Redirect(w, r, "/blog/"+slug, http.StatusMovedPermanently)
}

func redirectBlogPostWithFileExtension(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	slug = strings.TrimSuffix(slug, ".html")

	// Redirect away from year/month/day path. Just keeping this here for google
	http.Redirect(w, r, "/blog/"+slug, http.StatusFound)
}

func renderBlogPost(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]

	db := ctxDB(r)
	loggedIn := ctxGetLoggedIn(r)

	userAgent := ua.Parse(r.Header.Get("User-Agent"))

	// Fetch post
	post, err := db.Store.BlogPosts.Filter(models.Where.BlogPost.Slug.Eq(slug)).One()
	if db.IsNoResult(err) {
		routeNotFound(w, r)
		return
	} else if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	recommendedBlogPosts, err := db.RecommendedBlogPosts(r.Context(), &post.ID, 7)
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
		"pagePublishedTime":    post.Date,
		"pageModifiedTime":     post.UpdatedAt,
		"blogPost":             post,
		"recommendedBlogPosts": recommendedBlogPosts,
	})

	go func() {
		if !post.Published || userAgent.Bot || loggedIn {
			return
		}

		wc := WordCount(post.Content)
		post.Views += 1
		post.Score = CalculateScore(time.Now().Sub(post.Date), post.VotesUsers+post.Shares, post.Views, wc)
		err := db.Store.BlogPosts.Update(post)
		if err != nil {
			log.Println("Failed to update blog post views", err)
		}
	}()
}

func renderBlogPostRSS(w http.ResponseWriter, r *http.Request) {
	countStr := r.URL.Query().Get("limit")

	count := 20
	if countStr != "" {
		count, _ = strconv.Atoi(countStr)
	}

	// Fetch blog posts
	blogPosts, err := ctxDB(r).RecentBlogPosts(r.Context(), uint64(count))
	if err != nil {
		log.Println("Failed to load blog posts", err)
		http.Error(w, "Failed to load blog posts", http.StatusInternalServerError)
		return
	}

	feed := &feeds.Feed{
		Updated:     blogPosts[0].Date,
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
		feed.Items[i] = &feeds.Item{
			Title:   strings.Replace(blogPost.Title, "–", "&ndash;", -1),
			Id:      os.Getenv("BASE_URL") + "/blog/" + blogPost.ID,
			Created: blogPost.Date,
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

func renderBlogPostDrafts(w http.ResponseWriter, r *http.Request) {
	// Fetch blog posts
	drafts, err := ctxDB(r).DraftBlogPosts(r.Context())
	if err != nil {
		log.Println("Failed to load blog post blogPostDrafts", err)
		http.Error(w, "Failed to load blog posts blogPostDrafts", http.StatusInternalServerError)
		return
	}

	// Fetch blog posts
	unlisted, err := ctxDB(r).UnlistedBlogPosts(r.Context())
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

func renderBlogPosts(w http.ResponseWriter, r *http.Request) {
	// Redirect /blog = /blog/page/1
	if mux.Vars(r)["page"] == "" && mux.Vars(r)["tag"] == "" {
		http.Redirect(w, r, "/blog/page/1", http.StatusSeeOther)
		return
	}

	tag := mux.Vars(r)["tag"]
	page := StrToInt(mux.Vars(r)["page"], 1)

	first := 10
	skip := (page - 1) * first

	// Show all for tags
	if tag != "" {
		first = 999999
		skip = 0
	}

	// Fetch blog posts
	blogPosts, err := ctxDB(r).TaggedAndPublishedBlogPosts(
		r.Context(),
		tag,
		first+1,
		skip,
	)
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

	count := StrToInt(r.Form.Get("count"), 0)
	slug := r.Form.Get("slug")

	db := ctxDB(r)

	post, err := db.Store.BlogPosts.Filter(models.Where.BlogPost.Slug.Eq(slug)).One()
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
	userInc := int64(0)
	if count == 0 {
		userInc = 1
	}

	post.VotesTotal = post.VotesTotal + 1
	post.VotesUsers = post.VotesUsers + userInc
	err = db.Store.BlogPosts.Update(post)
	if err != nil {
		log.Println("Failed to vote", err)
		http.Error(w, "Failed to vote", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(fmt.Sprintf("%d", post.VotesTotal)))
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

	body, _ := json.Marshal(struct {
		URL string `json:"url"`
	}{
		URL: "https://assets.schier.dev/" + uploadPath,
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

func routeBlogDonate(w http.ResponseWriter, r *http.Request) {
	db := ctxDB(r)
	slug := mux.Vars(r)["slug"]

	userAgent := ua.Parse(r.Header.Get("User-Agent"))
	post, err := db.Store.BlogPosts.Filter(models.Where.BlogPost.Slug.Eq(slug)).One()
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	if userAgent.Bot {
		http.Error(w, "Bots can't donate", http.StatusNoContent)
		return
	}

	post.Shares += 1
	err = db.Store.BlogPosts.Update(post)
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	log.Println("Clicked donate link on", slug, r.Header.Get("User-Agent"))
	http.Redirect(w, r, "https://github.com/sponsors/gschier", http.StatusSeeOther)
}

func routeBlogShare(w http.ResponseWriter, r *http.Request) {
	slug := mux.Vars(r)["slug"]
	platform := mux.Vars(r)["platform"]

	db := ctxDB(r)

	post, err := db.Store.BlogPosts.Filter(models.Where.BlogPost.Slug.Eq(slug)).One()
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

	userAgent := ua.Parse(r.Header.Get("User-Agent"))
	if shareUrl != "" && !userAgent.Bot {
		post.Shares++
		_ = db.Store.BlogPosts.Update(post)
		log.Println("Shared", post.Slug, "to", platform, r.Header.Get("User-Agent"))
	}

	http.Redirect(w, r, shareUrl, http.StatusSeeOther)
}
