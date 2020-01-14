package web_test

import (
	"fmt"
	"github.com/gschier/schier.dev/web"
	"github.com/stretchr/testify/assert"
	"testing"
	"time"
)

func TestCapitalizeTitle(t *testing.T) {
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("this is the title"))
}

func TestCapitalizeTitleWithWeirdSpaces(t *testing.T) {
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("this   is\tthe\t  \n title"))
}

func TestCapitalizeTitleWithWeirdCharacters(t *testing.T) {
	assert.Equal(t, "I'm Fine That It's Okay", web.CapitalizeTitle("i'm fine that it's okay"))
}

func TestCapitalizeTitleWithEmoji(t *testing.T) {
	assert.Equal(t, "🚀 Example Title 🙆🏻‍♂️🤓!", web.CapitalizeTitle("🚀 example title 🙆🏻‍♂️🤓!"))
}

func TestCapitalizeTitleWithFirstLetterAlwaysUpper(t *testing.T) {
	assert.Equal(t, "A Big Thing", web.CapitalizeTitle("a big thing"))
	assert.Equal(t, "The Big Thing", web.CapitalizeTitle("the big thing"))
	assert.Equal(t, "🗻 The Big Thing", web.CapitalizeTitle("🗻 the big thing"))
}

func TestCapitalizeTitlePreserveNonFirstUppers(t *testing.T) {
	assert.Equal(t, "Hello ThisIsCamelCase", web.CapitalizeTitle("hello thisIsCamelCase"))
}

func TestCapitalizeTitleWorksWithHyphens(t *testing.T) {
	assert.Equal(t, "Something-Something", web.CapitalizeTitle("something-something"))
}

func TestCapitalizeTitleWorksWithQuotes(t *testing.T) {
	assert.Equal(t, "Something \"Quote\" Something", web.CapitalizeTitle("something \"quote\" something"))
}

func TestReadTimeRoundUp(t *testing.T) {
	assert.Equal(t, 1, web.ReadTime(0))
	assert.Equal(t, 1, web.ReadTime(1))
	assert.Equal(t, 1, web.ReadTime(99))
	assert.Equal(t, 1, web.ReadTime(150))
	assert.Equal(t, 2, web.ReadTime(250))
}

func TestStringToTags(t *testing.T) {
	assert.Equal(t, []string{"foo", "bar"}, web.StringToTags("|Foo|Bar|"))
	assert.Equal(t, []string{"foo", "bar"}, web.StringToTags("Foo|Bar"))
	assert.Equal(t, []string{"foo", "bar"}, web.StringToTags("Foo,Bar"))
	assert.Equal(t, []string{"foo", "bar", "baz"}, web.StringToTags("Foo, Bar, Baz"))
	assert.Equal(t, []string{"foo", "bar", "baz"}, web.StringToTags("Foo, Bar|Baz"))
}

func TestCalculateScore(t *testing.T) {
	tests := [][]int32{
		{0, 0, 0, 999999},
		{1, 0, 100, 50},
		{1, 0, 500, 250},
		{30, 0, 2000, 64},
		{1, 10, 100, 2050},
		{1, 10, 500, 2250},
		{30, 10, 2000, 193},
		{60, 10, 2000, 98},
		{500, 10, 8000, 169},
	}

	for _, v := range tests {
		t.Run(fmt.Sprintf("%d days %d votes %d views", v[0], v[1], v[2]), func(t *testing.T) {
			assert.Equal(t, v[3], web.CalculateScore(time.Hour*24*time.Duration(v[0]), v[1], v[2], 1000))
		})
	}
}
