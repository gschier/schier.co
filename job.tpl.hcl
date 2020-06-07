job "app.schierco" {
  datacenters = [
    "dc1"
  ]

  group "server" {
    count = 3

    update {
      canary = 1
      max_parallel = 5
      auto_promote = true
      auto_revert = true
      min_healthy_time = "1s"
      stagger = "1s"
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
        image = "registry.digitalocean.com/schierdev/schier.co:${GIT_SHA}"

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
{{ with secret "schier.dev/env" }}
{{ range $key, $val := .Data }}
{{ $key }}="{{ $val }}"
{{ end }}
{{ end }}
EOH
        env = true
        destination = "${NOMAD_SECRETS_DIR}/schierco.env"
        change_mode = "restart"
      }

      env {
        PORT = "${NOMAD_PORT_web}"
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
