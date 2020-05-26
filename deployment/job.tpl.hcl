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
        image = "registry.digitalocean.com/schierdev/schier.co:__DOCKER_TAG__"

        auth {
          username = "__DO_REGISTRY_TOKEN__"
          password = "__DO_REGISTRY_TOKEN__"
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
        CSRF_KEY = "__CSRF_KEY__"
        DEPLOY_LABEL = "__DEPLOY_LABEL__"
        DATABASE_URL = "__DATABASE_URL__"
        DEV_ENVIRONMENT = "production"
        DO_SPACES_DOMAIN = "nyc3.digitaloceanspaces.com"
        DO_SPACES_KEY = "__DO_SPACES_KEY__"
        DO_SPACES_SECRET = "__DO_SPACES_SECRET__"
        DO_SPACES_SPACE = "schierco"
        MAILJET_PRV_KEY = "__MAILJET_PRV_KEY__"
        MAILJET_PUB_KEY = "__MAILJET_PUB_KEY__"
        MIGRATE_ON_START = "disable"
        PORT = "${NOMAD_PORT_web}"
        STATIC_ROOT = "./static"
        STATIC_URL = "/static"
      }

      service {
        name = "schierco"
        port = "web"

        tags = [
          "urlprefix-schier.co/"
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
