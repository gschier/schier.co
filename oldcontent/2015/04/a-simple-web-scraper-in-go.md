---
title: "A Simple Web Scraper in Go"
slug: "a-simple-web-scraper-in-go"
date: "2015-04-26"
url: "blog/2015/04/26/a-simple-web-scraper-in-go.html"
tags: ["golang", "tutorial"]
---

In my day job at [Sendwithus](https://www.sendwithus.com), we've been having
trouble writing performant concurrent systems in Python. We've come to the
conclusion that Python just isn't suitable for some of our high throughput
tasks, so we've started playing around with [Go](https://golang.org/) as a
potential replacement.

After making it all the way through the
[Golang Interactive Tour](https://tour.golang.org), which I highly
recommend doing if you haven't yet, I wanted to build something real. The last
task in the Go tour is to build a concurrent web crawler, but it faked the fun
parts like making HTTP requests and parsing HTML. It was this that motivated me
to close the tutorial and write a real web scraper. This post is going to show
you how to build it.

There are three main things that we'll be covering:

- using the `net/http` package to fetch a web page
- using the `golang.org/x/net/html` to parse an HTML document
- using Go concurrency with multi-channel communication 

In order to keep this tutorial from being too long, I won't be
accommodating those of you that haven't yet made it through the
[Go Tour](https://tour.golang.org). The tour should teach you everything you
need to know to follow along.


What We'll Be Building
----------------------

As I mentioned in the introduction, we'll be going over how to build a simple web
scraper in Go. Note that I didn't say *web crawler* because our scraper will
only be going one level deep (maybe I'll cover crawling in another post).

To give you a brief description, we're going to be building a basic command line
tool that takes a list of starting URLs as input and prints all the links that 
it finds on those pages.

Here's an example of it in action:

```text
$ go run main.go https://schier.co https://google.com                  

Found 18 unique urls:

 - https://plus.google.com/102509209246537377732?rel=author
 - https://www.linkedin.com/profile/view?id=180332858
 - https://github.com/gschier
 - https://www.sendwithus.com
 - https://twitter.com/gregoryschier
 ...
```

Now that you know what we're building, let's get to the fun part.


Breaking it Down
----------------

To make this tutorial easier to digest, I'll be breaking it down isolated
components. After going over each component, I'll put them all together to form
the final product. The first component we'll be going over is making an HTTP
request to fetch some HTML.


### Fetching a Web Page by URL 

Making HTTP requests in Go is easy. The
[http](https://golang.org/pkg/net/http/) package provides a simple way of doing
this in just a couple lines of code.

*Note that things like error handling are omitted to keep this example short.*

```go
//~~~~~~~~~~~~~~~~~~~~~~//
// Make an HTTP request //
//~~~~~~~~~~~~~~~~~~~~~~//

resp, _ := http.Get(url)
bytes, _ := ioutil.ReadAll(resp.Body)

fmt.Println("HTML:\n\n", string(bytes))

resp.Body.Close()
```

Making an HTTP request is the foundation of our web scraper. Now that we
know how to do that, we can dig into parsing the HTML to extract links.


### Finding Links in HTML

Go doesn't have a core package for parsing HTML, but there is a package provided
in the
[Golang SubRepositores](https://code.google.com/p/go-wiki/wiki/SubRepositories)
that we can use by importing `golang.org/x/net/html`.

If you've never interacted with an XML or HTML tokenizer before, this may take
some time to grasp, but it's really not that difficult. The tokenizer splits
the HTML document into tokens that can be iterated over. Here are the possible
things that a token can represent
([documentation](https://godoc.org/golang.org/x/net/html#TokenType)):

| Token Name            | Token Description                              |
|:--------------------- |:-----------------------------------------------|
| `ErrorToken`          | error during tokenization (or end of document) |
| `TextToken`           | text node (contents of an element)             |
| `StartTagToken`       | example `<a>`                                  |
| `EndTagToken`         | example `</a>`                                 |
| `SelfClosingTagToken` | example `<br/>`                                |
| `CommentToken`        | example `<!-- Hello World -->`                 |
| `DoctypeToken`        | example `<!DOCTYPE html>`                      |

For our case, we are looking for URLs, which will be found inside opening `<a>`
tags. The code below demonstrates how to find all the opening anchor tags in an
HTML document.

```go
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Parse HTML for Anchor Tags //
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

z := html.NewTokenizer(response.Body)

for {
    tt := z.Next()

    switch {
    case tt == html.ErrorToken:
    	// End of the document, we're done
        return
    case tt == html.StartTagToken:
        t := z.Token()

        isAnchor := t.Data == "a"
        if isAnchor {
            fmt.Println("We found a link!")
        }
    }
}
```

Now that we have found the anchor tags, how do we get the `href` value?
Unfortunately, it's not as easy as you would expect. A token stores it's 
attributes in an array, so the only way to get the `href` is to iterate over
every attribute until we find it. Here's the code to do it.

```go
//~~~~~~~~~~~~~~~~~~~//
// Get Tag Attribute //
//~~~~~~~~~~~~~~~~~~~//

for _, a := range t.Attr {
    if a.Key == "href" {
        fmt.Println("Found href:", a.Val)
        break
    }
}
```

At this point we know how to fetch HTML using an HTTP request, as well as
extract the links from that HTML document. So what's next? Well, we need to put
it all together.

In order to make our scraper performant, and to make this tutorial a bit more
advanced, we'll be making use of goroutines and channels.


### Goroutines with Multiple Channels

Possibly the trickiest part of this scraper is how it uses channels. In 
order for the scraper to run quickly, it needs to fetch all URLs 
concurrently. If concurrency is used, total execution time should equal the
time taken to fetch the slowest request. Without concurrency
(synchronous requests), execution time would equal the sum of all request times
(BAD!). So how do we do this? 

The approach I've taken is to kick off one goroutine per request, having
each goroutine publish the URLs it finds to a shared channel. There's one
problem with this though. How do we know when to close the channel? We need some
way of knowing when the last URL has been published. We can use a second channel
for this.

The second channel is simply a notification channel. After a goroutine has
published all of it's URLs into the main channel, it publishes a *done* message
to the notification channel. The main thread subscribes to the notification
channel and closes the program after all goroutines have notified that they are
finished. This will make much more sense when you see the finished code.


Putting it All Together
-----------------------

If you've made it this far, you should know everything you need in order to
comprehend the full program. I've also added a few comments to help explain
some of the more complicated parts.

```go
package main

import (
	"fmt"
	"golang.org/x/net/html"
	"net/http"
	"os"
	"strings"
)

// Helper function to pull the href attribute from a Token
func getHref(t html.Token) (ok bool, href string) {
	// Iterate over all of the Token's attributes until we find an "href"
	for _, a := range t.Attr {
		if a.Key == "href" {
			href = a.Val
			ok = true
		}
	}
	
	// "bare" return will return the variables (ok, href) as defined in
	// the function definition
	return
}

// Extract all http** links from a given webpage
func crawl(url string, ch chan string, chFinished chan bool) {
	resp, err := http.Get(url)

	defer func() {
		// Notify that we're done after this function
		chFinished <- true
	}()

	if err != nil {
		fmt.Println("ERROR: Failed to crawl \"" + url + "\"")
		return
	}

	b := resp.Body
	defer b.Close() // close Body when the function returns

	z := html.NewTokenizer(b)

	for {
		tt := z.Next()

		switch {
		case tt == html.ErrorToken:
			// End of the document, we're done
			return
		case tt == html.StartTagToken:
			t := z.Token()

			// Check if the token is an <a> tag
			isAnchor := t.Data == "a"
			if !isAnchor {
				continue
			}

			// Extract the href value, if there is one
			ok, url := getHref(t)
			if !ok {
				continue
			}

			// Make sure the url begines in http**
			hasProto := strings.Index(url, "http") == 0
			if hasProto {
				ch <- url
			}
		}
	}
}

func main() {
	foundUrls := make(map[string]bool)
	seedUrls := os.Args[1:]

	// Channels
	chUrls := make(chan string)
	chFinished := make(chan bool) 

	// Kick off the crawl process (concurrently)
	for _, url := range seedUrls {
		go crawl(url, chUrls, chFinished)
	}

	// Subscribe to both channels
	for c := 0; c < len(seedUrls); {
		select {
		case url := <-chUrls:
			foundUrls[url] = true
		case <-chFinished:
			c++
		}
	}

	// We're done! Print the results...

	fmt.Println("\nFound", len(foundUrls), "unique urls:\n")

	for url, _ := range foundUrls {
		fmt.Println(" - " + url)
	}

	close(chUrls)
}
```


Wrap Up
-------

That wraps up the tutorial of a Go web scraper CLI. We've covered making HTTP
requests, parsing HTML, and even some slightly complicated concurrency patterns.

I hope it was simple  enough for you to follow along and maybe even learn a few
things. I'll probably be doing a few more of these posts as I learn more about
Go so make sure you subscribe, either via email (bottom of page) or
[RSS](https://schier.co/rss.xml).

As always, thanks for reading! :)

