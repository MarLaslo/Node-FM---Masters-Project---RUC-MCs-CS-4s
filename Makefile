.PHONY: config config-debug config-release b build build-debug build-release r run run-debug run-release re rebuild rebuild-debug rebuild-release clean rebuild-clean

UI_SOURCE ?= ON

config-debug:
	cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug -DNODEFM_UI_USE_SOURCE_FILES=$(UI_SOURCE)

config-release:
	cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DNODEFM_UI_USE_SOURCE_FILES=OFF

config: config-debug

build:
	cmake --build build

build-debug: config-debug build

build-release: config-release build

b: config-debug build

run-debug:
	./build/plugin/NodeFMWebView_artefacts/Debug/Standalone/NodeFMWebView.app/Contents/MacOS/NodeFMWebView

run-release:
	./build/plugin/NodeFMWebView_artefacts/Release/Standalone/NodeFMWebView.app/Contents/MacOS/NodeFMWebView

run: run-debug
r: run-debug

rebuild-debug: build-debug run-debug

rebuild-release: build-release run-release

rebuild: rebuild-debug
re: rebuild-debug

clean:
	rm -rf build

rebuild-clean: clean rebuild
