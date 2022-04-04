package internal

//func SchierCoBlogPostModel() banister.Model {
//	return banister.NewModel("BlogPost",
//		banister.NewCharField("id", 25).PrimaryKey(),
//		banister.NewDateTimeField("created_at"),
//		banister.NewDateTimeField("updated_at"),
//		banister.NewForeignKeyField("User").OnDelete(banister.OnDeleteSetNull),
//		banister.NewTextField("content"),
//		banister.NewDateTimeField("date"),
//		banister.NewDateTimeField("edited_at"),
//		banister.NewTextField("image"),
//		banister.NewBooleanField("published"),
//		banister.NewIntegerField("score"),
//		banister.NewIntegerField("shares"),
//		banister.NewTextField("slug").Unique(),
//		banister.NewIntegerField("stage"),
//		banister.NewTextField("title"),
//		banister.NewBooleanField("unlisted"),
//		banister.NewIntegerField("views"),
//		banister.NewIntegerField("votes_total"),
//		banister.NewIntegerField("votes_users"),
//		banister.NewTextArrayField("tags"),
//		banister.NewIntegerField("donations"),
//	)
//}
//
//func SchierCoUserModel() banister.Model {
//	return banister.NewModel("User",
//		banister.NewCharField("id", 25).PrimaryKey(),
//		banister.NewDateTimeField("created_at"),
//		banister.NewTextField("email").Unique(),
//		banister.NewTextField("name"),
//		banister.NewTextField("password_hash"),
//	)
//}
//
//func SchierCoSessionModel() banister.Model {
//	return banister.NewModel("Session",
//		banister.NewCharField("id", 25).PrimaryKey(),
//		banister.NewDateTimeField("created_at"),
//		banister.NewForeignKeyField("User").OnDelete(banister.OnDeleteCascade),
//	)
//}
//
//func SchierCoNewsletterSubscriberModel() banister.Model {
//	return banister.NewModel("NewsletterSubscriber",
//		banister.NewCharField("id", 25).PrimaryKey(),
//		banister.NewDateTimeField("created_at"),
//		banister.NewDateTimeField("updated_at"),
//		banister.NewTextField("email").Unique(),
//		banister.NewTextField("name"),
//		banister.NewBooleanField("unsubscribed"),
//	)
//}
//
//func SchierCoNewsletterSendModel() banister.Model {
//	return banister.NewModel("NewsletterSend",
//		banister.NewCharField("id", 25).PrimaryKey(),
//		banister.NewDateTimeField("created_at"),
//		banister.NewTextField("description").Default(""),
//		banister.NewTextField("key").Unique(),
//		banister.NewIntegerField("recipients"),
//	)
//}
