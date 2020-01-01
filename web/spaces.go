package web

import (
	"fmt"
	"github.com/minio/minio-go"
	"io"
	"log"
	"os"
	"path"
	"time"
)

func uploadImage(r io.Reader, contentType, name string, size int64) (string, error) {
	accessKey := os.Getenv("DO_SPACES_KEY")
	secKey := os.Getenv("DO_SPACES_SECRET")
	endpoint := os.Getenv("DO_SPACES_DOMAIN")
	spaceName := os.Getenv("DO_SPACES_SPACE")

	// Initiate a client using DigitalOcean Spaces.
	client, err := minio.New(endpoint, accessKey, secKey, true)
	if err != nil {
		log.Fatal(err)
	}

	uploadPath := fmt.Sprintf("images/a/%s%s", time.Now().Format(time.RFC3339), path.Ext(name))

	_, err = client.PutObject(spaceName, uploadPath, r, size, minio.PutObjectOptions{
		UserMetadata: map[string]string{"x-amz-acl": "public-read"},
		ContentType:  contentType,
	})
	if err != nil {
		return "", err
	}

	return uploadPath, nil
}
