package internal

import (
	"database/sql"
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

	"github.com/gschier/schier.co/internal/db"
)

func BlogRoutes(router *mux.Router) {
	// RSS
	router.Handle("/rss.xml", http.RedirectHandler("/blog/rss.xml", http.StatusSeeOther)).Methods(http.MethodGet)
	router.HandleFunc("/blog/rss.xml", routeBlogPostRSS).Methods(http.MethodGet)

	// Blog Static
	router.HandleFunc("/blog/new", Admin(routeBlogPostEditor)).Methods(http.MethodGet)
	router.HandleFunc("/blog/render", routeBlogPostPreview).Methods(http.MethodPost)
	router.HandleFunc("/blog/drafts", Admin(renderBlogPostDrafts)).Methods(http.MethodGet)
	router.HandleFunc("/blog", routeBlogPosts).Methods(http.MethodGet)
	router.HandleFunc("/blog/page/{page:[0-9]+}", routeBlogPosts).Methods(http.MethodGet)

	// Tags
	router.HandleFunc("/blog/tags", routeBlogPostTags).Methods(http.MethodGet)
	router.HandleFunc("/tags/{tag}", redirectBlogPostTagsOldPrefix).Methods(http.MethodGet)
	router.HandleFunc("/blog/tags/{tag}", routeBlogPosts).Methods(http.MethodGet)
	router.HandleFunc("/blog/share/{slug}/{platform}", routeBlogShare).Methods(http.MethodGet)
	router.HandleFunc("/blog/donate/{slug}", routeBlogDonate).Methods(http.MethodGet)

	// Posts
	router.HandleFunc("/blog/search", routeBlogPostSearch).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}.html", redirectBlogPostWithFileExtension).Methods(http.MethodGet)
	router.HandleFunc("/blog/{slug}", renderBlogPost).Methods(http.MethodGet)
	router.HandleFunc("/post/{slug}", redirectBlogPostOldPrefix).Methods(http.MethodGet)
	router.HandleFunc("/blog/{year}/{month}/{day}/{slug}", redirectBlogPostYearMonthDay).Methods(http.MethodGet)
	router.HandleFunc("/blog/edit/{id}", Admin(routeBlogPostEditor)).Methods(http.MethodGet)

	// Forms
	router.HandleFunc("/forms/blog/upsert", Admin(routeBlogPostCreateOrUpdate)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/publish", Admin(routeBlogPostPublish)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/delete", Admin(routeBlogPostDelete)).Methods(http.MethodPost)
	router.HandleFunc("/forms/blog/unlist", Admin(routeBlogPostUnlist)).Methods(http.MethodPost)

	// API
	router.HandleFunc("/api/blog/assets", Admin(routeUploadAsset)).Methods(http.MethodPut)
	router.HandleFunc("/api/blog/vote", routeVote).Methods(http.MethodPost)
}

func routeBlogPostTags(w http.ResponseWriter, r *http.Request) {
	blogPosts := ctxDB(r).Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.True(),
		gen.Where.BlogPost.Unlisted.False(),
	).Sort(
		gen.OrderBy.BlogPost.CreatedAt.Desc,
	).AllP()

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

	renderTemplate(w, r, pageTemplate("blog/tags.html"), &pongo2.Context{
		"pageTitle":       "Post Tags",
		"pageDescription": "Browse blog posts by tag category",
		"tags":            tags,
	})
}

func routeBlogPostPreview(w http.ResponseWriter, r *http.Request) {
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
		template = partialTemplate("blog_post.html")
	} else {
		template = pageTemplate("blog/post.html")
	}

	renderTemplate(w, r, template, &pongo2.Context{
		"loggedIn":      false,
		"pageTitle":     title,
		"showWordCount": true,
		"hideVoteEgg":   true,
		"blogPost": gen.BlogPost{
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

func routeBlogPostUnlist(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	post, err := ctxDB(r).Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	post.Unlisted = !post.Unlisted
	err = ctxDB(r).Store.BlogPosts.Update(post)
	if err != nil {
		log.Println("Failed to unlist Post", err)
		http.Error(w, "Failed to unlist Post", http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/blog/"+post.Slug, http.StatusSeeOther)
}

func routeBlogPostDelete(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()

	id := r.Form.Get("id")

	err := ctxDB(r).Store.BlogPosts.Filter(gen.Where.BlogPost.ID.Eq(id)).Delete()
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

	post, err := ctxDB(r).Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch Post", err)
		http.Error(w, "Failed to fetch Post", http.StatusInternalServerError)
		return
	}

	post.Published = published
	err = ctxDB(r).Store.BlogPosts.Update(post)
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
	blogPosts := make([]gen.BlogPost, 0)

	if query != "" {
		blogPosts = ctxDB(r).Store.BlogPosts.Filter(
			gen.Where.BlogPost.Published.True(),
			gen.Where.BlogPost.Unlisted.False(),
			gen.Where.BlogPost.Or(
				gen.Where.BlogPost.Content.IContains(query),
				gen.Where.BlogPost.Title.IContains(query),
				gen.Where.BlogPost.Tags.Contains([]string{strings.ToLower(query)}),
			),
		).Sort(gen.OrderBy.BlogPost.Date.Desc).Limit(20).AllP()
	}

	renderTemplate(w, r, pageTemplate("blog/search.html"), &pongo2.Context{
		"results": blogPosts,
		"query":   query,
	})
}

func routeBlogPostEditor(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	// Slug won't exist if it's a new post
	if id == "" {
		renderTemplate(w, r, pageTemplate("blog/edit.html"), nil)
		return
	}

	// Fetch blog posts
	blogPost, err := ctxDB(r).Store.BlogPosts.Get(id)
	if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	renderTemplate(w, r, pageTemplate("blog/edit.html"), &pongo2.Context{
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

	existingPost, err := ctxDB(r).Store.BlogPosts.Get(id)
	if err == sql.ErrNoRows {
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
		upsertErr = ctxDB(r).Store.BlogPosts.Update(existingPost)
	} else {
		if slug == "" {
			slug = slugLib.Make(title)
		}
		existingPost, upsertErr = ctxDB(r).Store.BlogPosts.Insert(
			gen.Set.BlogPost.Slug(slug),
			gen.Set.BlogPost.Title(title),
			gen.Set.BlogPost.Content(content),
			gen.Set.BlogPost.Image(image),
			gen.Set.BlogPost.UserID(user.ID),
			gen.Set.BlogPost.Tags(tags),
			gen.Set.BlogPost.Date(time.Now()),
			gen.Set.BlogPost.Stage(stage),
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

	loggedIn := ctxGetLoggedIn(r)
	userAgent := ua.Parse(r.Header.Get("User-Agent"))

	// Fetch post
	post, err := ctxDB(r).Store.BlogPosts.Filter(gen.Where.BlogPost.Slug.Eq(slug)).One()
	if err == sql.ErrNoRows {
		routeNotFound(w, r)
		return
	} else if err != nil {
		log.Println("Failed to fetch blog post", err)
		http.Error(w, "Failed to get blog post", http.StatusInternalServerError)
		return
	}

	recommendedBlogPosts := recommendedBlogPosts(ctxDB(r).Store, &post.ID, 7).AllP()

	// Render template
	renderTemplate(w, r, pageTemplate("blog/post.html"), &pongo2.Context{
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
		err := ctxDB(r).Store.BlogPosts.Update(post)
		if err != nil {
			log.Println("Failed to update blog post views", err)
		}
	}()
}

func routeBlogPostRSS(w http.ResponseWriter, r *http.Request) {
	countStr := r.URL.Query().Get("limit")

	count := 20
	if countStr != "" {
		count, _ = strconv.Atoi(countStr)
	}

	// Fetch blog posts
	blogPosts := recentBlogPosts(ctxDB(r).Store, uint64(count)).AllP()

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

	rss, err := feed.ToRss()
	if err != nil {
		http.Error(w, "failed to generate RSS", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/xml")
	_, _ = w.Write([]byte(rss))
}

func renderBlogPostDrafts(w http.ResponseWriter, r *http.Request) {
	// Fetch blog posts
	drafts := ctxDB(r).Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.False(),
	).Sort(
		gen.OrderBy.BlogPost.Stage.Desc,
		gen.OrderBy.BlogPost.EditedAt.Desc,
	).AllP()

	// Fetch blog posts
	unlisted := ctxDB(r).Store.BlogPosts.Filter(
		gen.Where.BlogPost.Unlisted.True(),
	).Sort(
		gen.OrderBy.BlogPost.UpdatedAt.Desc,
	).AllP()

	renderTemplate(w, r, pageTemplate("blog/drafts.html"), &pongo2.Context{
		"drafts":   drafts,
		"unlisted": unlisted,
	})
}

func routeBlogPosts(w http.ResponseWriter, r *http.Request) {
	// Redirect /blog = /blog/page/1
	if mux.Vars(r)["page"] == "" && mux.Vars(r)["tag"] == "" {
		http.Redirect(w, r, "/blog/page/1", http.StatusSeeOther)
		return
	}

	tag := mux.Vars(r)["tag"]
	page := StrToInt(mux.Vars(r)["page"], 1)

	first := 10
	skip := (page - 1) * first

	query := ctxDB(r).Store.BlogPosts.Filter(
		gen.Where.BlogPost.Published.True(),
		gen.Where.BlogPost.Unlisted.False(),
	)

	if tag != "" {
		query.Filter(gen.Where.BlogPost.Tags.Contains([]string{tag}))
	} else {
		// ONly limit when filtering not by tags
		query.Limit(uint64(first + 1)).Offset(uint64(skip))
	}

	blogPosts := query.Sort(gen.OrderBy.BlogPost.Date.Desc).
		Limit(uint64(first + 1)).
		Offset(uint64(skip)).
		AllP()

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
	renderTemplate(w, r, pageTemplate("blog/list.html"), &pongo2.Context{
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

	post, err := ctxDB(r).Store.BlogPosts.Filter(gen.Where.BlogPost.Slug.Eq(slug)).One()
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
	err = ctxDB(r).Store.BlogPosts.Update(post)
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
	slug := mux.Vars(r)["slug"]

	userAgent := ua.Parse(r.Header.Get("User-Agent"))
	post, err := ctxDB(r).Store.BlogPosts.Filter(gen.Where.BlogPost.Slug.Eq(slug)).One()
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
	err = ctxDB(r).Store.BlogPosts.Update(post)
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

	post, err := ctxDB(r).Store.BlogPosts.Filter(gen.Where.BlogPost.Slug.Eq(slug)).One()
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
		_ = ctxDB(r).Store.BlogPosts.Update(post)
		log.Println("Shared", post.Slug, "to", platform, r.Header.Get("User-Agent"))
	}

	http.Redirect(w, r, shareUrl, http.StatusSeeOther)
}
