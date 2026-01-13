.PHONY: config config-debug config-release build build-debug build-release run run-debug run-release rebuild rebuild-debug rebuild-release

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
	./build/plugin/NodeFMWebViewPlugin_artefacts/Debug/Standalone/NodeFMWebViewPlugin.app/Contents/MacOS/NodeFMWebViewPlugin

run-release:
	./build/plugin/NodeFMWebViewPlugin_artefacts/Release/Standalone/NodeFMWebViewPlugin.app/Contents/MacOS/NodeFMWebViewPlugin

run: run-debug

rebuild-debug: build-debug run-debug

rebuild-release: build-release run-release

rebuild: rebuild-debug