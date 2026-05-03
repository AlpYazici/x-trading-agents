.PHONY: dev api web up down logs clean

dev:
	@echo "Run in two terminals:"
	@echo "  make api"
	@echo "  make web"

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

clean:
	rm -rf apps/web/.next apps/web/node_modules apps/api/.venv
