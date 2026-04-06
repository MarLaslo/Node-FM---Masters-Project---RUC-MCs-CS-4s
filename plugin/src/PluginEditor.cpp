#include "NodeFMWebViewPlugin/PluginProcessor.h"
#include "NodeFMWebViewPlugin/PluginEditor.h"

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
        
        // Notify UI about the default output node after browser loads
        juce::Timer::callAfterDelay(500, [this]()
        {
            NodeID outputNodeID = processorRef.getOutputNodeID();
            NodeID operatorNodeID = processorRef.getOperatorNodeID();
            
            juce::var outputNodeData = new juce::DynamicObject();
            outputNodeData.getDynamicObject()->setProperty("id", (int)outputNodeID);
            outputNodeData.getDynamicObject()->setProperty("type", "output");
            sendMessageToJS("NODE_ADDED", outputNodeData);
            
            juce::var operatorNodeData = new juce::DynamicObject();
            operatorNodeData.getDynamicObject()->setProperty("id", (int)operatorNodeID);
            operatorNodeData.getDynamicObject()->setProperty("type", "operator");
            sendMessageToJS("NODE_ADDED", operatorNodeData);

            juce::var connectionData = new juce::DynamicObject();
            connectionData.getDynamicObject()->setProperty("sourceNodeId", (int)operatorNodeID);
            connectionData.getDynamicObject()->setProperty("destNodeId", (int)outputNodeID);
            connectionData.getDynamicObject()->setProperty("amount", 1.0f);
            sendMessageToJS("CONNECTION_ADDED", connectionData);
            
            DBG("Sent default graph to UI: operator " << (int)operatorNodeID << " -> output " << (int)outputNodeID);
        });
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
            
            DBG("UI Request: Add node of type " << nodeType);
            
            auto nodeId = processorRef.addNode(nodeType, obj->getProperty("data"));
            
            DBG("Node created with ID: " << (int)nodeId);
            
            // Send confirmation back to UI
            juce::var nodeData = new juce::DynamicObject();
            nodeData.getDynamicObject()->setProperty("id", (int)nodeId);
            nodeData.getDynamicObject()->setProperty("type", nodeType);
            sendMessageToJS("NODE_ADDED", nodeData);
        }
        else if (type == "ADD_CONNECTION")
        {
            auto connectionData = obj->getProperty("data");
            if (auto* connObj = connectionData.getDynamicObject())
            {
                auto sourceVal = connObj->getProperty("sourceNodeId").toString();
                auto destVal = connObj->getProperty("destNodeId").toString();
                auto amountVal = connObj->getProperty("amount").toString();
                
                NodeID sourceNodeId = sourceVal.getIntValue();
                NodeID destNodeId = destVal.getIntValue();
                float amount = amountVal.getFloatValue();
                
                DBG("UI Request: Connect node " << (int)sourceNodeId << " -> " << (int)destNodeId << " (amount: " << amount << ")");
                
                processorRef.addConnection(sourceNodeId, destNodeId, amount);
                
                // Send confirmation back to UI
                juce::var connData = new juce::DynamicObject();
                connData.getDynamicObject()->setProperty("sourceNodeId", (int)sourceNodeId);
                connData.getDynamicObject()->setProperty("destNodeId", (int)destNodeId);
                connData.getDynamicObject()->setProperty("amount", amount);
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
            sendMessageToJS("CONNECTION_ADDED", connectionData);
            
            sendMessageToJS("GRAPH_CLEARED", outputNodeData);
            
            DBG("Graph cleared, new output node ID: " << (int)newOutputNodeID);
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
    }

    void AudioPluginAudioProcessorEditor::resized()
    {
        auto bounds = getLocalBounds();
        webView.setBounds(bounds);
    }

    auto AudioPluginAudioProcessorEditor::getResource(const juce::String &url) -> std::optional<Resource>
    {
        std::cout << url << std::endl;

        static const auto resourceFileRoot = juce::File{R"(/Users/marek/Documents/Developer/Master-Thesis/NodeFMWebView/plugin/ui/public)"};

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