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

      vault {
        policies = [
          "schier.co",
        ]
      }

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

      template {
        env         = true
        destination = "${NOMAD_SECRETS_DIR}/schierco.env"
        change_mode = "restart"
        data        = <<EOH
{{ with secret "schier.co/env" }}
{{ range $key, $val := .Data }}
{{ $key }}="{{ $val }}"
{{ end }}
{{ end }}
EOH
      }

      env {
        PORT = "${NOMAD_PORT_web}"
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

