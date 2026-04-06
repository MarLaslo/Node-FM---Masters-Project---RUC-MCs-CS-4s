.PHONY: config config-debug config-release build build-debug build-release run run-debug run-release rebuild rebuild-debug rebuild-release clean rebuild-clean

config-debug:
	cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug

config-release:
	cmake -S . -B build -DCMAKE_BUILD_TYPE=Release

config: config-debug

build:
	cmake --build build

build-debug: config-debug build

build-release: config-release build

run-debug:
	./build/plugin/NodeFMWebView_artefacts/Debug/Standalone/NodeFMWebView.app/Contents/MacOS/NodeFMWebViewAS

run-release:
	./build/plugin/NodeFMWebView_artefacts/Release/Standalone/NodeFMWebView.app/Contents/MacOS/NodeFMWebViewAS

run: run-debug

rebuild-debug: build-debug run-debug

rebuild-release: build-release run-release

rebuild: rebuild-debug

clean:
	rm -rf build

rebuild-clean: clean rebuild
