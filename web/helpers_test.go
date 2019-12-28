package web_test

import (
	"github.com/gschier/schier.dev/web"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestCapitalizeTitle(t *testing.T) {
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("this is the title"))
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("THIS IS THE TITLE"))
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("tHIS iS THe tItLE"))
	assert.Equal(t, "This Is the - Title", web.CapitalizeTitle("tHIS iS THe - tItLE"))
}

func TestCapitalizeTitleWithWeirdSpaces(t *testing.T) {
	assert.Equal(t, "This Is the Title", web.CapitalizeTitle("this   is\tthe\t  \n title"))
}
