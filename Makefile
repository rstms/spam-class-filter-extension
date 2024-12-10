
docker = env DOCKER_BUILD_OUTPUT=plain BUILDKIT_PROGRESS=plain docker

eslint: .eslint
	docker run --rm -v "$$(pwd):/app" eslint

fmt: .prettier
	chmod 0660 editor.html
	find assets -type f -exec chmod 0660 \{\} \;
	docker run --rm -v "$$(pwd):/app" prettier --tab-width 4 --print-width 135 --write "**/*.js" --write "**/*.css" --write "**/*.html"

.prettier: prettier/Dockerfile
	cd prettier && $(docker) build . -t prettier
	touch $@

.eslint: eslint/Dockerfile
	cd eslint && $(docker) build . -t eslint
	touch $@
