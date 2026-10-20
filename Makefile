.DEFAULT_GOAL := help
ROOT := $(shell cd "$$(dirname -- "$(MAKEFILE_LIST)")" && pwd)
PYTHON ?= python3.11
VENV ?= $(ROOT)/.venv
PY := $(VENV)/bin/python
export PATH := $(VENV)/bin:$(PATH)
ENV_FILE ?= $(ROOT)/.env
PORT ?= 8000
PROJECT_ARGS = $(if $(PROJECT),-p "$(PROJECT)",)
COMPOSE = docker compose --project-directory "$(ROOT)" --env-file "$(ENV_FILE)" $(PROJECT_ARGS)
LLM_RUNTIME ?= cpu
LLM_ENV_FILE ?= $(ROOT)/.env.llm
# A prepared private configuration opts this installation into local inference.
WITH_LLM ?= $(shell test -f "$(LLM_ENV_FILE)" && printf 1 || printf 0)
LLM_COMPOSE = llm-cpu.yml
LLM_ARGS = $(if $(filter 1,$(WITH_LLM)),--env-file "$(LLM_ENV_FILE)" --profile llm,)
LLM_FILES = $(if $(filter 1,$(WITH_LLM)),-f "$(ROOT)/docker/compose/$(LLM_COMPOSE)" -f "$(ROOT)/docker/compose/reports.yml",)
BASE = -f "$(ROOT)/docker/compose/base.yml"
DEV = $(COMPOSE) $(LLM_ARGS) $(BASE) -f "$(ROOT)/docker/compose/dev.yml" $(LLM_FILES)
PROD = $(COMPOSE) $(LLM_ARGS) $(BASE) -f "$(ROOT)/docker/compose/prod.yml" $(LLM_FILES)
SETTINGS_COMPOSE = $(DEV)

.PHONY: help install init models backend frontend test test-all build up up-prod down logs llm-up backup replace-dds-tickets prepare-dds-demo cutover-brief-reports package-offline deploy-offline check-python check-llm check-env
help:
	@printf '%s\n' 'Setup:   make install | init | check-env | models [WITH_LLM=1]' 'Develop: make backend [PORT=8000] | frontend' 'Verify:  make test | test-all' 'Docker:  make build | up | up-prod | down | logs' 'LLM:     .env.llm enables local CPU inference for ordinary up/down/logs' '         make up LLM_ENV_FILE=/private/file.env | WITH_LLM=0 to disable' 'Data:    make backup | replace-dds-tickets [ARGS=--apply]' 'Reports: make cutover-brief-reports ARGS="--env-file /private/settings.env [--apply]"' 'Demo:    make prepare-dds-demo ARGS="--database /path/demo.db --output /path/preview.json"' 'Offline: make package-offline ARGS="--help"' '         make deploy-offline ARCHIVE=/path/bundle.tar.gz [ARGS="..."]' 'LLM_RUNTIME=cpu only; GPU access is disabled' 'Options: ENV_FILE=/private/file.env PROJECT=existing_project VENV=/path/venv'

install:
	@cd "$(ROOT)" && "$(PYTHON)" -c 'import sys; assert sys.version_info[:2] == (3,11), "Use Python 3.11"'
	@cd "$(ROOT)" && "$(PYTHON)" -m venv "$(VENV)"
	@cd "$(ROOT)" && "$(PY)" -m pip install --require-hashes -r backend/requirements/runtime.lock
	@cd "$(ROOT)" && "$(PY)" -m pip install -r backend/requirements/test.txt
	@cd "$(ROOT)/frontend" && npm ci --ignore-scripts

init:
	@"$(PYTHON)" "$(ROOT)/tools/setup_env.py" --init

check-python:
	@test -x "$(PY)" || { printf '%s\n' 'Run make install or set VENV to your Python 3.11 environment.' >&2; exit 1; }
	@"$(PY)" -c 'import sys; assert sys.version_info[:2] == (3,11), "Use Python 3.11"'

backend: check-python
	@bash "$(ROOT)/backend/scripts/run.sh" "$(PORT)"

frontend:
	@cd "$(ROOT)/frontend" && npm run dev

test: check-python
	@cd "$(ROOT)"; status=0; \
	 bash tools/quality/verify.sh all || status=1; \
	 "$(PY)" -m pytest -c tools/tests/acceptance/pytest.ini tools/tests/acceptance -q || status=1; \
	 "$(PY)" -m unittest discover -s docker/offline/tests -v || status=1; \
	 "$(PY)" -m unittest discover -s tools/tests/utilities -v || status=1; \
	 exit $$status

test-all: check-python
	@cd "$(ROOT)"; status=0; \
	 $(MAKE) --no-print-directory -f "$(ROOT)/Makefile" test || status=1; \
	 bash tools/quality/verify.sh backend-all || status=1; exit $$status

build:
	@cd "$(ROOT)" && docker build -f docker/images/backend.Dockerfile -t "$${BACKEND_IMAGE:-simulator_backend:latest}" .
	@cd "$(ROOT)" && docker build -f docker/images/frontend.Dockerfile -t "$${FRONTEND_IMAGE:-simulator_frontend:latest}" .

check-llm:
	@case "$(LLM_RUNTIME)" in cpu) ;; *) echo 'Only LLM_RUNTIME=cpu is supported; GPU access is disabled.' >&2; exit 1;; esac
	@if [ "$(WITH_LLM)" = 1 ]; then test -n "$(LLM_ENV_FILE)" && test -f "$(LLM_ENV_FILE)" || { echo 'Set LLM_ENV_FILE to an existing private env file.' >&2; exit 1; }; fi

check-env: check-llm
	@$(SETTINGS_COMPOSE) config --format json | python3 "$(ROOT)/tools/setup_env.py" --check-compose

models: check-llm
	@if [ -f "$(ENV_FILE)" ]; then \
	 $(DEV) config --format json | python3 "$(ROOT)/tools/provision_models.py" --compose; \
	 else \
	  if [ "$(WITH_LLM)" = 1 ]; then \
	   docker compose --project-directory "$(ROOT)" --env-file "$(LLM_ENV_FILE)" -f "$(ROOT)/docker/compose/$(LLM_COMPOSE)" --profile llm config --format json | python3 "$(ROOT)/tools/provision_models.py" --compose --only-llm || exit $$?; \
	  fi; \
	  python3 "$(ROOT)/tools/provision_models.py"; fi

up: check-env
	@$(DEV) config --format json | python3 "$(ROOT)/tools/provision_models.py" --compose
	@$(DEV) up -d --build

up-prod: SETTINGS_COMPOSE = $(PROD)
up-prod: check-env
	@$(PROD) up -d --no-build

down: check-llm
	@$(DEV) down

logs: check-llm
	@$(DEV) logs -f

llm-up: check-llm
	@test -n "$(LLM_ENV_FILE)" && test -f "$(LLM_ENV_FILE)" || { echo 'Set LLM_ENV_FILE to an existing private env file.' >&2; exit 1; }
	@docker compose --project-directory "$(ROOT)" --env-file "$(LLM_ENV_FILE)" -f "$(ROOT)/docker/compose/$(LLM_COMPOSE)" --profile llm config --format json | python3 "$(ROOT)/tools/provision_models.py" --compose --only-llm
	@docker compose --project-directory "$(ROOT)" --env-file "$(LLM_ENV_FILE)" -p "$(if $(PROJECT),$(PROJECT),imba-llm)" -f "$(ROOT)/docker/compose/$(LLM_COMPOSE)" --profile llm up -d

backup: check-python
	@cd "$(ROOT)" && "$(PY)" -m backend.scripts.db.backup

replace-dds-tickets: check-python
	@cd "$(ROOT)" && "$(PY)" -m backend.scripts.db.replace_dds_tickets --env-file "$(ENV_FILE)" $(ARGS)

prepare-dds-demo: check-python
	@cd "$(ROOT)" && "$(PY)" -m backend.scripts.db.prepare_dds_demo $(ARGS)

cutover-brief-reports: check-python
	@cd "$(ROOT)" && "$(PY)" -m backend.scripts.db.cutover_brief_reports $(ARGS)

package-offline:
	@bash "$(ROOT)/docker/offline/package.sh" $(ARGS)

deploy-offline:
	@test -n "$(ARCHIVE)" || { echo 'Set ARCHIVE=/path/bundle.tar.gz; use ARGS for installer options.' >&2; exit 1; }
	@bash "$(ROOT)/docker/offline/deploy.sh" "$(ARCHIVE)" $(ARGS)
