package models

import "github.com/gschier/banister"

var NewsletterSubscriber = banister.NewModel(
	"NewsletterSubscriber",
	banister.NewCharField("id", 25).PrimaryKey(),
	banister.NewDateTimeField("created_at"),
	banister.NewDateTimeField("updated_at"),
	banister.NewTextField("email").Unique(),
	banister.NewTextField("name"),
	banister.NewBooleanField("unsubscribed"),
)
