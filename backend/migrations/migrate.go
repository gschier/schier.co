package migrations

import (
	"github.com/gschier/schier.dev/internal"
	"sort"
	"strings"
)

var allMigrations = make([]internal.Migration, 0)

func All() []internal.Migration {
	sort.Slice(allMigrations, func(i, j int) bool {
		return strings.Compare(allMigrations[i].Name, allMigrations[j].Name) < 0
	})

	return allMigrations
}
