
.prettier: prettier/Dockerfile
	cd prettier && docker build . -t prettier
	touch $@

fmt: .prettier
	docker run --rm -v "$(pwd):/app" prettier --write "**/*.js"

