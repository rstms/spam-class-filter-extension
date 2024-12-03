
.prettier: prettier/Dockerfile
	cd prettier && docker build . -t prettier
	touch $@

fmt: .prettier
	docker run --rm -v "$$(pwd):/app" prettier --tab-width 4 --print-width 135 --write "**/*.js" --write "**/*.css" --write "**/*.html"

