job "app.schierco" {
  datacenters = [
    "dc1"
  ]

  group "server" {
    count = 5

    update {
      canary = 1
      max_parallel = 5
      auto_promote = true
      auto_revert = true
      min_healthy_time = "5s"
      stagger = "10s"
      health_check = "checks"
    }

    task "server" {
      driver = "docker"

      config {
        image = "registry.digitalocean.com/schierdev/schier.co:<REPLACE_ME>"

        auth {
          username = "<REPLACE_ME>"
          password = "<REPLACE_ME>"
        }
      }

      resources {
        memory = 30
        network {
          mbits = 5
          port "web" {}
        }
      }

      env {
        BASE_URL = "https://schier.co"
        CSRF_KEY = "<REPLACE_ME>"
        DATABASE_URL = "<REPLACE_ME>"
        DEV_ENVIRONMENT = "production"
        DO_SPACES_DOMAIN = "nyc3.digitaloceanspaces.com"
        DO_SPACES_KEY = "<REPLACE_ME>"
        DO_SPACES_SECRET = "<REPLACE_ME>"
        DO_SPACES_SPACE = "schierco"
        MAILJET_PRV_KEY = "<REPLACE_ME>"
        MAILJET_PUB_KEY = "<REPLACE_ME>"
        MIGRATE_ON_START = "enable"
        PORT = "${NOMAD_PORT_web}"
        STATIC_ROOT = "./static"
        STATIC_URL = "/static"
      }

      service {
        name = "schierco"
        port = "web"

        tags = [
          "urlprefix-schier.co/",
          "urlprefix-schier.dev/"
        ]

        check {
          type = "http"
          path = "/debug/health"
          interval = "60s"
          timeout = "5s"
        }
      }
    }
  }
}
