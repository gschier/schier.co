---
title: "Generators in Go"
slug: "generators-in-go"
date: "2015-04-27"
url: "blog/2015/04/27/generators-in-go.html"
tags: ["golang", "tutorial"]
---

While Go does not have an official construct for generators, it is possible to
use channels to achieve the same effect. Below is a function called `count` that
generates numbers from `0` to `n`.

```Go
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
// Generator that counts to n //
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

func count(n int) (chan int) {
	ch := make(chan int)
	
	go func () {
		for i := 0; i < n; i++ {
			ch <- i
		}
		close(ch)
	}()
	
	return ch
}

func main() {
	for i := range count(10) {
		fmt.Println("Counted", i)
	}
}
```

As you can see, our `main` function can now use `count` like a generator without
needing to handle channel creation.
