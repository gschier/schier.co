package models

import "github.com/gschier/banister"

var NewsletterSend = banister.NewModel("NewsletterSend",
	banister.NewCharField("id", 25).PrimaryKey(),
	banister.NewDateTimeField("created_at"),
	banister.NewTextField("description").Default(""),
	banister.NewTextField("key").Unique(),
	banister.NewIntegerField("recipients"),
)
