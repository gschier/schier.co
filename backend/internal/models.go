package internal

type BlogPost struct {
	ID          string  `json:"id"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Slug        string  `json:"slug"`
	Published   bool    `json:"published"`
	Image       string  `json:"image"`
	Title       string  `json:"title"`
	Date        string  `json:"date"`
	DateUpdated *string `json:"dateUpdated,omitempty"`
	Content     string  `json:"content"`
	Tags        string  `json:"tags"`
	Views       int32   `json:"views"`
	Shares      int32   `json:"shares"`
	VotesTotal  int32   `json:"votesTotal"`
	VotesUsers  int32   `json:"votesUsers"`
	Unlisted    bool    `json:"unlisted"`
	Stage       int32   `json:"stage"`
	Score       int32   `json:"score"`
}
