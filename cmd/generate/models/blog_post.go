package models

import "github.com/gschier/banister"

var BlogPost = banister.NewModel(
	"BlogPost",
	banister.NewCharField("id", 25).PrimaryKey(),
	banister.NewDateTimeField("created_at"),
	banister.NewDateTimeField("updated_at"),
	banister.NewForeignKeyField(User.Settings().Name).OnDelete(banister.OnDeleteSetNull),
	banister.NewTextField("content"),
	banister.NewDateTimeField("date"),
	banister.NewDateTimeField("edited_at"),
	banister.NewTextField("image"),
	banister.NewTextField("summary").Default(""),
	banister.NewBooleanField("published"),
	banister.NewIntegerField("score"),
	banister.NewIntegerField("shares"),
	banister.NewTextField("slug").Unique(),
	banister.NewIntegerField("stage"),
	banister.NewTextField("title"),
	banister.NewBooleanField("unlisted"),
	banister.NewIntegerField("views"),
	banister.NewIntegerField("votes_total"),
	banister.NewIntegerField("votes_users"),
	banister.NewTextArrayField("tags"),
	banister.NewIntegerField("donations"),
)
