package internal

import (
	"github.com/stretchr/testify/assert"
	"testing"
)

var md = `
This is a nice paragraph -- with some _formatting_ and a [link](https://schier.co).

- this
- is
- a
- list
`

var mdWithMore = `
This is a nice paragraph -- with some _formatting_ and a [link](https://schier.co).

And a second paragraph.

<!--more-->

- this
- is
- a
- list
`

func TestSummary(t *testing.T) {
	r := Summary(md)

	assert.Equal(t, "This is a nice paragraph – with some formatting and a link.", r)
}

func TestSummaryWithMore(t *testing.T) {
	r := Summary(mdWithMore)

	assert.Equal(t, "This is a nice paragraph – with some formatting and a link. And a second paragraph.", r)
}
