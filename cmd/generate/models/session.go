package models

import "github.com/gschier/banister"

var Session = banister.NewModel(
	"Session",
	banister.NewCharField("id", 25).PrimaryKey(),
	banister.NewDateTimeField("created_at"),
	banister.NewForeignKeyField(User.Settings().Name).OnDelete(banister.OnDeleteCascade),
)
