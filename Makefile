
all: fmt

.prettier: prettier/Dockerfile
	cd prettier && docker build . -t prettier
	touch $@

fmt: .prettier
	chmod 0660 editor.html
	find assets -type f -exec chmod 0660 \{\} \;
	docker run --rm -v "$$(pwd):/app" prettier --tab-width 4 --print-width 135 --write "**/*.js" --write "**/*.css" --write "**/*.html"

script = <script type="module" src="editor.js"></script>

