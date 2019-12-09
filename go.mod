module github.com/gschier/schier.dev

// +heroku goVersion go1.12
// +heroku install ./cmd/...

require (
	github.com/Depado/bfchroma v1.2.0
	github.com/alecthomas/chroma v0.6.0
	github.com/dgrijalva/jwt-go v3.2.0+incompatible // indirect
	github.com/flosch/pongo2 v0.0.0-20190707114632-bbf5a6c351f4
	github.com/gorilla/csrf v1.6.1
	github.com/gorilla/feeds v1.1.1
	github.com/gorilla/handlers v1.4.2
	github.com/gorilla/mux v1.7.3
	github.com/machinebox/graphql v0.2.2
	github.com/mitchellh/mapstructure v1.1.2 // indirect
	github.com/pkg/errors v0.8.1 // indirect
	github.com/prisma/prisma-client-lib-go v0.0.0-20181017161110-68a1f9908416
	github.com/russross/blackfriday v2.0.0+incompatible // indirect
	github.com/russross/blackfriday/v2 v2.0.1
	github.com/satori/go.uuid v1.2.0 // indirect
	github.com/writeas/go-strip-markdown v2.0.1+incompatible
	golang.org/x/crypto v0.0.0-20191111213947-16651526fdb4
	gopkg.in/yaml.v2 v2.2.2
)
