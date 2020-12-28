job "app.schierco" {
  datacenters = [
    "dc1"
  ]

  type = "service"

  group "web" {
    count = 1

    update {
      canary           = 1
      auto_promote     = true
      auto_revert      = true
      min_healthy_time = "1s"
      health_check     = "checks"
    }

    task "web" {
      driver = "docker"

      config {
        image = "ghcr.io/gschier/schier.co:__DOCKER_TAG__"

        auth {
          username = "${GH_REGISTRY_TOKEN}"
          password = "${GH_REGISTRY_TOKEN}"
        }
      }

      resources {
        memory = 50
        network {
          mbits = 5
          port "web" {}
        }
      }

      env {
        PORT = "${NOMAD_PORT_web}"

        # Secrets
        BASE_URL          = "__BASE_URL__",
        CSRF_KEY          = "__CSRF_KEY__",
        DATABASE_URL      = "__DATABASE_URL__",
        DEV_ENVIRONMENT   = "__DEV_ENVIRONMENT__",
        DO_SPACES_DOMAIN  = "__DO_SPACES_DOMAIN__",
        DO_SPACES_KEY     = "__DO_SPACES_KEY__",
        DO_SPACES_SECRET  = "__DO_SPACES_SECRET__",
        DO_SPACES_SPACE   = "__DO_SPACES_SPACE__",
        GH_REGISTRY_TOKEN = "__GH_REGISTRY_TOKEN__",
        MAILJET_PRV_KEY   = "__MAILJET_PRV_KEY__",
        MAILJET_PUB_KEY   = "__MAILJET_PUB_KEY__",
        MIGRATE_ON_START  = "__MIGRATE_ON_START__",
        STATIC_URL        = "__STATIC_URL__",
      }

      service {
        name = "web"
        port = "web"

        tags = [
          "urlprefix-schier.co/"
        ]

        check {
          type     = "http"
          path     = "/debug/health"
          interval = "60s"
          timeout  = "5s"
        }
      }
    }
  }
}

