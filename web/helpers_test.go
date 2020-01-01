package web_test

import (
	"github.com/gschier/schier.dev/web"
	"github.com/stretchr/testify/assert"
	"testing"
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
