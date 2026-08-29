APP_NAME = PLGridQueue
PACKAGE = $(APP_NAME)

.PHONY: build run test clean install uninstall pack

build:
	swift build -c release

run:
	swift run $(PACKAGE)

test:
	swift run PLGridQueueTestRunner

build-app:
	chmod +x Scripts/build-app.sh
	./Scripts/build-app.sh

install: build-app
	cp -R build/$(APP_NAME).app /Applications/
	@echo "$(APP_NAME) installed to /Applications/$(APP_NAME).app"

uninstall:
	rm -rf /Applications/$(APP_NAME).app
	@echo "$(APP_NAME) removed from /Applications."

pack: build-app
	cd build && zip -r $(APP_NAME).zip $(APP_NAME).app
	@echo "Created build/$(APP_NAME).zip"

clean:
	swift package clean
	rm -rf build
