#include "NodeFMWebViewPlugin/PluginProcessor.h"
#include "NodeFMWebViewPlugin/PluginEditor.h"

#ifndef NODEFM_UI_SOURCE_DIR
#define NODEFM_UI_SOURCE_DIR ""
#endif

namespace nodefm_plugin
{
    namespace
    {
        auto streamToVector(juce::InputStream &stream)
        {
            using namespace juce;

            std::vector<std::byte> result((size_t)stream.getTotalLength());
            stream.setPosition(0);
            [[maybe_unused]] const auto bytesRead = stream.read(result.data(), result.size());
            jassert(bytesRead == (ssize_t)result.size());
            return result;
        }

        const char *getMimeForExtension(const juce::String &extension)
        {
            using namespace juce;
            static const std::unordered_map<String, const char *> mimeMap =
                {
                    {{"htm"}, "text/html"},
                    {{"html"}, "text/html"},
                    {{"txt"}, "text/plain"},
                    {{"jpg"}, "image/jpeg"},
                    {{"jpeg"}, "image/jpeg"},
                    {{"svg"}, "image/svg+xml"},
                    {{"ico"}, "image/vnd.microsoft.icon"},
                    {{"json"}, "application/json"},
                    {{"png"}, "image/png"},
                    {{"css"}, "text/css"},
                    {{"map"}, "application/json"},
                    {{"js"}, "text/javascript"},
                    {{"woff2"}, "font/woff2"}};

            if (const auto it = mimeMap.find(extension.toLowerCase()); it != mimeMap.end())
                return it->second;

            jassertfalse;
            return "";
        }

    }

    AudioPluginAudioProcessorEditor::AudioPluginAudioProcessorEditor(AudioPluginAudioProcessor &p)
        : AudioProcessorEditor(&p), processorRef(p),
          webView{juce::WebBrowserComponent::Options{}.withResourceProvider([this](const auto &url)
                                                                            { return getResource(url); })
                      .withNativeIntegrationEnabled().withUserScript(R"(console.log("Backend loaded");)").withInitialisationData("info", "NodeFMWebView").withEventListener("messageFromJS", [this](const auto& event) {
              if (event.isString())
                  handleMessageFromJS(event.toString());
          })}
    {
        juce::ignoreUnused(processorRef);

        addAndMakeVisible(webView);

        webView.goToURL(webView.getResourceProviderRoot());
        setResizable(true, true);
        setSize(800, 600);
        startTimerHz(30);

        juce::Component::SafePointer<AudioPluginAudioProcessorEditor> safeThis(this);
        juce::Timer::callAfterDelay(500, [safeThis]()
                                    {
                                        if (safeThis == nullptr)
                                            return;

                                        safeThis->sendCurrentGraphToUI();
                                    });
    }

    void AudioPluginAudioProcessorEditor::sendCurrentGraphToUI()
    {
        sendMessageToJS("GRAPH_STATE_SYNC", processorRef.getGraphSnapshotForUI());
        DBG("Sent current graph snapshot to UI");
    }

    void AudioPluginAudioProcessorEditor::handleMessageFromJS(const juce::String& message)
{
    auto json = juce::JSON::parse(message);
    if (auto* obj = json.getDynamicObject())
    {
        auto type = obj->getProperty("type").toString();
        
        if (type == "ADD_NODE")
        {
            auto nodeType = obj->getProperty("nodeType").toString();
            auto requestData = obj->getProperty("data");
            
            DBG("UI Request: Add node of type " << nodeType);
            
            auto nodeId = processorRef.addNode(nodeType, requestData);
            
            DBG("Node created with ID: " << (int)nodeId);
            
            // Send confirmation back to UI
            juce::var nodeData = new juce::DynamicObject();
            nodeData.getDynamicObject()->setProperty("id", (int)nodeId);
            nodeData.getDynamicObject()->setProperty("type", nodeType);

            // Preserve requested UI placement if provided by the frontend.
            if (auto* requestDataObj = requestData.getDynamicObject())
            {
                auto position = requestDataObj->getProperty("position");
                if (auto* positionObj = position.getDynamicObject())
                {
                    const auto x = static_cast<double>(positionObj->getProperty("x"));
                    const auto y = static_cast<double>(positionObj->getProperty("y"));
                    juce::var positionData = new juce::DynamicObject();
                    positionData.getDynamicObject()->setProperty("x", x);
                    positionData.getDynamicObject()->setProperty("y", y);
                    nodeData.getDynamicObject()->setProperty("position", positionData);
                }
            }

            sendMessageToJS("NODE_ADDED", nodeData);
        }
        else if (type == "UI_READY")
        {
            DBG("UI reported ready, sending current graph snapshot");
            sendCurrentGraphToUI();
        }
        else if (type == "ADD_CONNECTION")
        {
            auto connectionData = obj->getProperty("data");
            if (auto* connObj = connectionData.getDynamicObject())
            {
                auto sourceVal = connObj->getProperty("sourceNodeId").toString();
                auto destVal = connObj->getProperty("destNodeId").toString();
                auto amountVal = connObj->getProperty("amount").toString();
                auto connectionTypeValue = connObj->getProperty("connectionType").toString().toLowerCase();
                
                NodeID sourceNodeId = sourceVal.getIntValue();
                NodeID destNodeId = destVal.getIntValue();
                float amount = amountVal.getFloatValue();
                const ConnectionType connectionType = (connectionTypeValue == "gain")
                    ? ConnectionType::gain
                    : ConnectionType::modulation;
                
                DBG("UI Request: Connect node " << (int)sourceNodeId << " -> " << (int)destNodeId << " (amount: " << amount << ", type: " << (connectionType == ConnectionType::gain ? "gain" : "modulation") << ")");
                
                processorRef.addConnection(sourceNodeId, destNodeId, amount, connectionType);
                
                // Send confirmation back to UI
                juce::var connData = new juce::DynamicObject();
                connData.getDynamicObject()->setProperty("sourceNodeId", (int)sourceNodeId);
                connData.getDynamicObject()->setProperty("destNodeId", (int)destNodeId);
                connData.getDynamicObject()->setProperty("amount", amount);
                connData.getDynamicObject()->setProperty("connectionType", connectionType == ConnectionType::gain ? "gain" : "modulation");
                sendMessageToJS("CONNECTION_ADDED", connData);
            }
        }
        else if (type == "UPDATE_NODE_PARAMETER")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                NodeID nodeId = dataObj->getProperty("nodeId").toString().getIntValue();
                juce::String paramName = dataObj->getProperty("paramName").toString();
                float value = dataObj->getProperty("value").toString().getFloatValue();
                
                DBG("UI Request: Update node " << (int)nodeId << " parameter '" << paramName << "' = " << value);
                
                processorRef.updateNodeParameter(nodeId, paramName, value);
                
                // Send confirmation back to UI
                sendMessageToJS("NODE_PARAMETER_UPDATED", data);
            }
        }
        else if (type == "UPDATE_NODE_POSITION")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                NodeID nodeId = dataObj->getProperty("nodeId").toString().getIntValue();
                const float x = static_cast<float>(dataObj->getProperty("x"));
                const float y = static_cast<float>(dataObj->getProperty("y"));

                processorRef.updateNodePosition(nodeId, x, y);
                DBG("Persisted node position id=" << static_cast<int>(nodeId) << " x=" << x << " y=" << y);
            }
        }
        else if (type == "UPDATE_CONNECTION")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                NodeID sourceNodeId = dataObj->getProperty("sourceNodeId").toString().getIntValue();
                NodeID destNodeId = dataObj->getProperty("destNodeId").toString().getIntValue();
                float amount = dataObj->getProperty("amount").toString().getFloatValue();
                
                DBG("UI Request: Update connection " << (int)sourceNodeId << " -> " << (int)destNodeId << " (amount: " << amount << ")");
                
                processorRef.updateConnectionAmount(sourceNodeId, destNodeId, amount);
                
                // Send confirmation back to UI
                sendMessageToJS("CONNECTION_UPDATED", data);
            }
        }
        else if (type == "REMOVE_CONNECTION")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                const NodeID sourceNodeId = dataObj->getProperty("sourceNodeId").toString().getIntValue();
                const NodeID destNodeId = dataObj->getProperty("destNodeId").toString().getIntValue();
                const auto connectionTypeValue = dataObj->getProperty("connectionType").toString().toLowerCase();
                const ConnectionType connectionType = connectionTypeValue == "gain"
                    ? ConnectionType::gain
                    : ConnectionType::modulation;

                const bool removed = processorRef.removeConnection(sourceNodeId, destNodeId, connectionType);
                if (removed)
                {
                    juce::var response = new juce::DynamicObject();
                    response.getDynamicObject()->setProperty("sourceNodeId", static_cast<int>(sourceNodeId));
                    response.getDynamicObject()->setProperty("destNodeId", static_cast<int>(destNodeId));
                    response.getDynamicObject()->setProperty("connectionType", connectionType == ConnectionType::gain ? "gain" : "modulation");
                    sendMessageToJS("CONNECTION_REMOVED", response);
                }
            }
        }
        else if (type == "REMOVE_NODE")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                const NodeID nodeId = dataObj->getProperty("nodeId").toString().getIntValue();
                const bool removed = processorRef.removeNode(nodeId);

                if (removed)
                {
                    DBG("UI Request: Removed node " << static_cast<int>(nodeId));
                    sendMessageToJS("NODE_REMOVED", data);
                }
                else
                {
                    DBG("UI Request: Remove node rejected for node " << static_cast<int>(nodeId));
                }
            }
        }
        else if (type == "CLEAR_GRAPH")
        {
            DBG("UI Request: Clear graph");
            
            // Clear the backend graph and get the new output node ID
            NodeID newOutputNodeID = processorRef.clearGraph();
            NodeID newOperatorNodeID = processorRef.getOperatorNodeID();
            
            // Send confirmation back to UI with the new output node
            juce::var outputNodeData = new juce::DynamicObject();
            outputNodeData.getDynamicObject()->setProperty("id", (int)newOutputNodeID);
            outputNodeData.getDynamicObject()->setProperty("type", "output");
            sendMessageToJS("NODE_ADDED", outputNodeData);

            juce::var operatorNodeData = new juce::DynamicObject();
            operatorNodeData.getDynamicObject()->setProperty("id", (int)newOperatorNodeID);
            operatorNodeData.getDynamicObject()->setProperty("type", "operator");
            sendMessageToJS("NODE_ADDED", operatorNodeData);

            juce::var connectionData = new juce::DynamicObject();
            connectionData.getDynamicObject()->setProperty("sourceNodeId", (int)newOperatorNodeID);
            connectionData.getDynamicObject()->setProperty("destNodeId", (int)newOutputNodeID);
            connectionData.getDynamicObject()->setProperty("amount", 1.0f);
            connectionData.getDynamicObject()->setProperty("connectionType", "gain");
            sendMessageToJS("CONNECTION_ADDED", connectionData);
            
            sendMessageToJS("GRAPH_CLEARED", outputNodeData);
            
            DBG("Graph cleared, new output node ID: " << (int)newOutputNodeID);
        }
        else if (type == "UPDATE_OUTPUT_GAIN")
        {
            auto data = obj->getProperty("data");
            if (auto* dataObj = data.getDynamicObject())
            {
                const float gain = dataObj->getProperty("gain").toString().getFloatValue();
                processorRef.updateOutputGain(gain);
            }
        }
    }
}

    void AudioPluginAudioProcessorEditor::sendMessageToJS(const juce::String& eventType, const juce::var& data)
    {
        juce::var message = new juce::DynamicObject();
        message.getDynamicObject()->setProperty("type", eventType);
        message.getDynamicObject()->setProperty("data", data);
        
        auto jsonString = juce::JSON::toString(message);
        webView.emitEventIfBrowserIsVisible(eventType, jsonString);
    }

    AudioPluginAudioProcessorEditor::~AudioPluginAudioProcessorEditor()
    {
        stopTimer();
    }

    void AudioPluginAudioProcessorEditor::timerCallback()
    {
        if (!isShowing())
            return;

        sendMessageToJS("SPECTRUM_UPDATE", processorRef.getSpectrumForUI());
    }

    void AudioPluginAudioProcessorEditor::resized()
    {
        auto bounds = getLocalBounds();
        webView.setBounds(bounds);
    }

    juce::File AudioPluginAudioProcessorEditor::findUIResourceRoot() const
    {
        // Prefer the requested UI source tree or bundle resources depending on build mode.
#if NODEFM_UI_USE_SOURCE_FILES && defined(NODEFM_UI_SOURCE_DIR)
        const auto sourceResources = juce::File{NODEFM_UI_SOURCE_DIR};
        if (sourceResources.isDirectory())
            return sourceResources;
#endif

        const auto executable = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
        const auto bundleResources = executable.getParentDirectory()
                                         .getParentDirectory()
                                         .getChildFile("Resources")
                                         .getChildFile("ui")
                                         .getChildFile("public");

        if (bundleResources.isDirectory())
            return bundleResources;

        const auto workingDirResources = juce::File::getCurrentWorkingDirectory()
                                             .getChildFile("plugin")
                                             .getChildFile("ui")
                                             .getChildFile("public");
        if (workingDirResources.isDirectory())
            return workingDirResources;

#if !NODEFM_UI_USE_SOURCE_FILES && defined(NODEFM_UI_SOURCE_DIR)
        const auto sourceResources = juce::File{NODEFM_UI_SOURCE_DIR};
        if (sourceResources.isDirectory())
            return sourceResources;
#endif

        return {};
    }

    auto AudioPluginAudioProcessorEditor::getResource(const juce::String &url) -> std::optional<Resource>
    {
        std::cout << url << std::endl;

        static const auto resourceFileRoot = findUIResourceRoot();
        if (!resourceFileRoot.isDirectory())
            return std::nullopt;

        const auto resourceToRetrieve = url == "/" ? "index.html" : url.fromFirstOccurrenceOf("/", false, false);

        const auto resource = resourceFileRoot.getChildFile(resourceToRetrieve).createInputStream();

        if (resource)
        {
            const auto extension = resourceToRetrieve.fromLastOccurrenceOf(".", false, false);
            return Resource{
                streamToVector(*resource), getMimeForExtension(extension)};
        }

        return std::nullopt;
    }
}