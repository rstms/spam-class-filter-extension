
docker = env DOCKER_BUILD_OUTPUT=plain BUILDKIT_PROGRESS=plain docker

default: fmt lint

lint: .eslint 
	docker run --rm -v "$$(pwd):/app" eslint *.js

eslint.config.js: .eslint
	docker run -it --rm -v "$$(pwd):/app" eslint config >$@

shell:
	docker run -it --rm -v "$$(pwd):/app" eslint shell


fmt: .prettier
	chmod 0660 editor.html
	find assets -type f -exec chmod 0660 \{\} \;
	docker run --rm -v "$$(pwd):/app" prettier --tab-width 4 --print-width 135 --write "**/*.js" --write "**/*.css" --write "**/*.html"

.prettier: prettier/Dockerfile
	cd prettier && $(docker) build . -t prettier
	touch $@

.eslint: eslint/Dockerfile eslint/entrypoint eslint/eslint.config.js
	cd eslint && $(docker) build . -t eslint
	touch $@

release:
	rm -f release.zip
	zip release.zip -r *.js *.html manifest.json VERSION assets
	( rm -rf testo && mkdir testo && cd testo && unzip ../release.zip ); find testo

	# mv release.zip dist/spam-class-extension-$(shell cat VERSION).xpi

clean:
	rm -f .eslint
	docker rmi eslint || true
	rm -f .prettier
	docker rmi prettier || true
	rm -rf node_modules
	rm -rf testo
	rm release.zip
