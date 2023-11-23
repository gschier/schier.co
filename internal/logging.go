package internal

import (
	"fmt"
	"log/slog"
	"os"
)

func NewLogger(prefix string) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == "msg" {
				a.Value = slog.StringValue(fmt.Sprintf("[%s] %s", prefix, a.Value))
			}
			return a
		},
	}))
}
