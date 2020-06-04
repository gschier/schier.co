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

      vault {
        policies = [
          "schier.co",
        ]
      }

      config {
        image = "registry.digitalocean.com/schierdev/schier.co:${GITHUB_SHA}"

        auth {
          username = "${DO_REGISTRY_TOKEN}"
          password = "${DO_REGISTRY_TOKEN}"
        }
      }

      resources {
        memory = 30
        network {
          mbits = 5
          port "web" {}
        }
      }

      template {
        data = <<EOH
{{ with secret "schier.co/env" }}
CSRF_KEY = "{{ .Data.CSRF_KEY }}"
DO_REGISTRY_TOKEN = "{{ .Data.DO_REGISTRY_TOKEN }}"
DO_SPACES_DOMAIN = "{{ .Data.DO_SPACES_DOMAIN }}"
DO_SPACES_KEY = "{{ .Data.DO_SPACES_KEY }}"
DO_SPACES_SECRET = "{{ .Data.DO_SPACES_SECRET }}"
DO_SPACES_SPACE = "{{ .Data.DO_SPACES_SPACE }}"
MAILJET_PRV_KEY = "{{ .Data.MAILJET_PRV_KEY }}"
MAILJET_PUB_KEY = "{{ .Data.MAILJET_PUB_KEY }}"
DATABASE_URL="{{ .Data.DATABASE_URL }}"
{{ end }}
EOH
        env = true
        destination = "${NOMAD_SECRETS_DIR}/file.env"
        change_mode = "restart"
      }

      env {
        BASE_URL = "https://schier.co"
        DEV_ENVIRONMENT = "production"
        GITHUB_REPOSITORY = "__GITHUB_REPOSITORY__"
        GITHUB_SHA = "__GITHUB_SHA__"
        MIGRATE_ON_START = "enable"
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
