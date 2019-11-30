package schier_dev

import (
	"github.com/gschier/schier.dev/generated/prisma-client"
	"os"
)

func NewPrismaClient() *prisma.Client {
	return prisma.New(&prisma.Options{
		Endpoint: os.Getenv("PRISMA_ENDPOINT"),
		Secret:   os.Getenv("PRISMA_SECRET"),
	})
}
