UUID = plgrid-queue@jpniewski
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SRC_FILES = metadata.json extension.js indicator.js slurmService.js prefs.js stylesheet.css

.PHONY: all schemas install uninstall enable disable reload prefs pack test clean

all: schemas

schemas:
	glib-compile-schemas schemas/

install: schemas
	mkdir -p $(INSTALL_DIR)/schemas
	cp $(SRC_FILES) $(INSTALL_DIR)/
	cp schemas/org.gnome.shell.extensions.plgrid-queue.gschema.xml $(INSTALL_DIR)/schemas/
	cp schemas/gschemas.compiled $(INSTALL_DIR)/schemas/
	@echo "Extension installed to $(INSTALL_DIR)"

uninstall:
	gnome-extensions disable $(UUID) 2>/dev/null || true
	rm -rf $(INSTALL_DIR)
	@echo "Extension uninstalled."

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

reload:
	gnome-extensions disable $(UUID) 2>/dev/null || true
	sleep 0.5
	gnome-extensions enable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

pack: schemas
	gnome-extensions pack --force --extra-source=slurmService.js --extra-source=indicator.js

test: schemas
	gjs -m test/test_parser.js

clean:
	rm -f schemas/gschemas.compiled
	rm -f $(UUID).shell-extension.zip
