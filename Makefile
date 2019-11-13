start/backend:
	docker-compose up web

start/frontend:
	npm start

deploy:
	prisma deploy --force
