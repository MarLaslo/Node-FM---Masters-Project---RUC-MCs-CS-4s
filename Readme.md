cmake -S . -B build
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug

cmake --build build

./build/plugin/NodeFMWebViewPlugin_artefacts/Standalone/NodeFMWebViewPlugin.app