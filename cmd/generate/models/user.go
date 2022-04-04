package models

import "github.com/gschier/banister"

var User = banister.NewModel(
	"User",
	banister.NewCharField("id", 25).PrimaryKey(),
	banister.NewDateTimeField("created_at"),
	banister.NewTextField("email").Unique(),
	banister.NewTextField("name"),
	banister.NewTextField("password_hash"),
)
