package migrations

import (
	"github.com/gschier/schier.dev/internal/migrate"
	"sort"
	"strings"
)

var allMigrations = make([]migrate.Migration, 0)

func All() []migrate.Migration {
	sort.Slice(allMigrations, func(i, j int) bool {
		return strings.Compare(allMigrations[i].Name, allMigrations[j].Name) < 0
	})

	return allMigrations
}
