
# thunderbird extension makefile

docker = env DOCKER_BUILD_OUTPUT=plain BUILDKIT_PROGRESS=plain docker
gitclean = if git status --porcelain | grep '^.*$$'; then echo git status is dirty; false; else echo git status is clean; true; fi

src = $(wildcard *.js)
html = $(wildcard *.html)
package_files = manifest.json VERSION LICENSE README.md $(src) $(html) assets

all: fmt lint assets $(html) $(src) 

assets: exported/assets
	rm -rf assets
	mkdir assets
	mv exported/assets/* assets

editor.html: exported/editor.html
	sed '/<script>/,/<\/script>/d' $< >$@

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

.prettier: docker/prettier/Dockerfile
	cd docker/prettier && $(docker) build . -t prettier
	touch $@

.eslint: docker/eslint/Dockerfile docker/eslint/entrypoint docker/eslint/eslint.config.js
	cd docker/eslint && $(docker) build . -t eslint
	touch $@

release_file = spam-class-extension-$(shell cat VERSION).xpi

release: all
	@$(gitclean) || { [ -n "$(dirty)" ] && echo "allowing dirty release"; }
	rm -f release.zip
	zip release.zip -r $(package_files)
	( rm -rf testo && mkdir testo && cd testo && unzip ../release.zip ); find testo
	mv release.zip dist/$(release_file)
	@$(if $(update),gh release delete -y v$(version),)
	gh release create v$(version) --notes "v$(version)"
	( cd dist && gh release uplaod v$(version) $(release_file) )

clean:
	rm -f .eslint
	docker rmi eslint || true
	rm -f .prettier
	docker rmi prettier || true
	rm -rf node_modules
	rm -rf testo
	rm release.zip
