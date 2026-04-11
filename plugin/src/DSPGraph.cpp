#include "NodeFMWebViewPlugin/graph/DSPGraph.h"
#include "NodeFMWebViewPlugin/dsp/Oscillator.h"
#include "NodeFMWebViewPlugin/dsp/Output.h"
#include <algorithm>
#include <queue>
#include <unordered_set>

namespace nodefm_plugin
{
    NodeID DSPGraph::addNode(std::unique_ptr<DSPNode> node)
    {
        NodeID id = nextNodeID++;
        node->nodeId = id;
        nodes[id] = std::move(node);
        
        if (outputNodeID == 0)
        {
            outputNodeID = id;
        }
        
        updateProcessingOrder();
        return id;
    };

    void DSPGraph::setOutputNode(NodeID id)
    {
        outputNodeID = id;
    }

    ConnectionID DSPGraph::addConnection(NodeID source, NodeID dest, float amount, ConnectionType type)
    {
        ConnectionID id = nextConnectionID++;
        connections.push_back({id, source, dest, amount, type});
        
        DBG("Added connection: Node " << (int)source << " -> Node " << (int)dest << " (amount: " << amount << ", type: " << (type == ConnectionType::gain ? "gain" : "modulation") << ")");
        
        updateProcessingOrder(); // Recalculate topological order
        return id;
    }

    void DSPGraph::removeNode(NodeID id)
    {
        if (nodes.find(id) == nodes.end())
            return;

        nodes.erase(id);
        nodePositions.erase(id);

        connections.erase(
            std::remove_if(
                connections.begin(),
                connections.end(),
                [id](const Connection& conn)
                {
                    return conn.source == id || conn.destination == id;
                }),
            connections.end());

        if (outputNodeID == id)
            outputNodeID = 0;

        updateProcessingOrder();
    }

    void DSPGraph::removeConnection(ConnectionID id)
    {
        connections.erase(
            std::remove_if(
                connections.begin(),
                connections.end(),
                [id](const Connection& conn)
                {
                    return conn.id == id;
                }),
            connections.end());

        updateProcessingOrder();
    }

    bool DSPGraph::removeConnection(NodeID source, NodeID dest, ConnectionType type)
    {
        const auto previousSize = connections.size();

        connections.erase(
            std::remove_if(
                connections.begin(),
                connections.end(),
                [source, dest, type](const Connection& conn)
                {
                    return conn.source == source && conn.destination == dest && conn.type == type;
                }),
            connections.end());

        const auto removed = connections.size() < previousSize;
        if (removed)
            updateProcessingOrder();

        return removed;
    }

    void DSPGraph::setSampleRate(float sr)
    {
        // Pass sample rate to all oscillators
        for (auto& [id, node] : nodes)
        {
            if (auto* osc = dynamic_cast<Oscillator*>(node.get()))
            {
                osc->setSampleRate(sr);
            }
        }
    }
    
    void DSPGraph::setNoteFrequency(float freq)
    {
        // Update all oscillators with the new base frequency
        DBG("Setting note frequency: " << freq << " Hz");
        for (auto& [id, node] : nodes)
        {
            if (auto* osc = dynamic_cast<Oscillator*>(node.get()))
            {
                osc->setFrequency(freq);
                DBG("  Node " << (int)id << " frequency: " << freq << " * ratio " << osc->frequencyRatio << " = " << (freq * osc->frequencyRatio) << " Hz");
            }
        }
    }
    
    void DSPGraph::noteOn()
    {
        // Trigger note on for all oscillators
        DBG("Note On - Triggering ADSR envelopes");
        for (auto& [id, node] : nodes)
        {
            if (auto* osc = dynamic_cast<Oscillator*>(node.get()))
            {
                osc->noteOn();
            }
        }
    }
    
    void DSPGraph::noteOff()
    {
        // Trigger note off for all oscillators
        DBG("Note Off - Releasing ADSR envelopes");
        for (auto& [id, node] : nodes)
        {
            if (auto* osc = dynamic_cast<Oscillator*>(node.get()))
            {
                osc->noteOff();
            }
        }
    }
    
    bool DSPGraph::isAnyEnvelopeActive() const
    {
        // Check if any oscillator's envelope is still active
        for (const auto& [id, node] : nodes)
        {
            if (const auto* osc = dynamic_cast<const Oscillator*>(node.get()))
            {
                if (osc->envelope.isActive())
                {
                    return true;
                }
            }
        }
        return false;
    }
    
    void DSPGraph::updateConnection(NodeID source, NodeID dest, float newAmount)
    {
        for (auto& conn : connections)
        {
            if (conn.source == source && conn.destination == dest)
            {
                DBG("Updated connection: Node " << (int)source << " -> Node " << (int)dest << " (amount: " << conn.ammount << " -> " << newAmount << ")");
                conn.ammount = newAmount;
                return;
            }
        }
        DBG("WARNING: Connection not found for update: Node " << (int)source << " -> Node " << (int)dest);
    }
    
    DSPNode* DSPGraph::getNode(NodeID id)
    {
        auto it = nodes.find(id);
        if (it != nodes.end())
        {
            return it->second.get();
        }
        return nullptr;
    }
    
    void DSPGraph::process(float* outputBuffer, int numSamples)
    {
        // Process entire buffer efficiently
        for (int sample = 0; sample < numSamples; ++sample)
        {
            // Process nodes in topological order
            for (NodeID id : processingOrder)
            {
                if (auto nodeIt = nodes.find(id); nodeIt != nodes.end())
                {
                    auto *node = nodeIt->second.get();
                    if (!node) continue;
                    
                    // Reset modulation input before applying connections
                    node->resetModulation();
                    
                    // Apply input connections for this node
                    for (const auto &conn : connections)
                    {
                        if (conn.destination == id)
                        {
                            // Safety check: ensure both source and destination exist
                            auto sourceIt = nodes.find(conn.source);
                            
                            if (sourceIt != nodes.end())
                            {
                                auto *sourceNode = sourceIt->second.get();
                                
                                if (sourceNode)
                                {
                                    float *sourceOut = sourceNode->getOutput();
                                    if (sourceOut)
                                    {
                                        const float routedValue = sourceOut[0] * conn.ammount;
                                        if (conn.type == ConnectionType::modulation)
                                            node->addModulation(routedValue);
                                        else
                                            node->addModulation(routedValue);
                                    }
                                }
                            }
                        }
                    }
                    
                    // Process the node (single sample)
                    node->process(1);
                }
            }

            // Write output from designated output node
            if (auto it = nodes.find(outputNodeID); it != nodes.end())
            {
                outputBuffer[sample] = it->second->getOutput()[0];
            }
            else
            {
                outputBuffer[sample] = 0.0f;
            }
        }
    };

    void DSPGraph::updateProcessingOrder()
    {
        // Kahn's algorithm for topological sorting
        processingOrder.clear();
        
        DBG("=== Updating Processing Order ===");
        DBG("Total nodes: " << nodes.size());
        DBG("Total connections: " << connections.size());
        
        if (nodes.empty())
        {
            DBG("No nodes to process");
            return;
        }
        
        // Build in-degree map (count incoming connections for each node)
        std::unordered_map<NodeID, int> inDegree;
        for (const auto& [id, node] : nodes)
        {
            inDegree[id] = 0;
        }
        
        for (const auto& conn : connections)
        {
            if (nodes.find(conn.destination) != nodes.end())
            {
                inDegree[conn.destination]++;
            }
        }
        
        // Queue of nodes with no incoming connections (can be processed first)
        std::queue<NodeID> queue;
        for (const auto& [id, degree] : inDegree)
        {
            if (degree == 0)
            {
                queue.push(id);
            }
        }
        
        // Process nodes in topological order
        while (!queue.empty())
        {
            NodeID current = queue.front();
            queue.pop();
            processingOrder.push_back(current);
            
            for (const auto& conn : connections)
            {
                if (conn.source == current)
                {
                    NodeID dest = conn.destination;
                    if (nodes.find(dest) != nodes.end())
                    {
                        inDegree[dest]--;
                        if (inDegree[dest] == 0)
                        {
                            queue.push(dest);
                        }
                    }
                }
            }
        }
        
        if (processingOrder.size() != nodes.size())
        {
            DBG("WARNING: Cycle detected! Processed " << processingOrder.size() << " of " << nodes.size() << " nodes");
            std::unordered_set<NodeID> processed(processingOrder.begin(), processingOrder.end());
            for (const auto& [id, node] : nodes)
            {
                if (processed.find(id) == processed.end())
                {
                    DBG("Adding unprocessed node (cycle): " << (int)id);
                    processingOrder.push_back(id);
                }
            }
        }
        
        DBG("Final processing order:");
        for (size_t i = 0; i < processingOrder.size(); ++i)
        {
            DBG("  [" << i << "] Node ID: " << (int)processingOrder[i]);
        }
        DBG("===========================");
    }    
    
    void DSPGraph::clearGraph()
    {
        DBG("=== Clearing DSP Graph ===");
        
        // Clear all nodes and connections
        nodes.clear();
        connections.clear();
        processingOrder.clear();
        this->nodePositions.clear();
        
        // Reset ID counters
        nextNodeID = 1;
        nextConnectionID = 1;
        outputNodeID = 0;
        
        DBG("Graph cleared successfully");
    }

    void DSPGraph::setNodePosition(NodeID id, float x, float y)
    {
        if (nodes.find(id) == nodes.end())
            return;

        this->nodePositions[id] = {x, y};
    }

    juce::XmlElement DSPGraph::createStateXml() const
    {
        juce::XmlElement state("DSP_GRAPH_STATE");
        state.setAttribute("outputNodeId", static_cast<int>(outputNodeID));
        state.setAttribute("nextNodeID", static_cast<int>(nextNodeID));
        state.setAttribute("nextConnectionID", static_cast<int>(nextConnectionID));

        juce::XmlElement nodesElement("NODES");
        for (const auto& [id, node] : nodes)
        {
            juce::XmlElement nodeElement("NODE");
            nodeElement.setAttribute("id", static_cast<int>(id));

            if (const auto positionIt = this->nodePositions.find(id); positionIt != this->nodePositions.end())
            {
                nodeElement.setAttribute("x", positionIt->second.first);
                nodeElement.setAttribute("y", positionIt->second.second);
            }

            if (dynamic_cast<const Output*>(node.get()) != nullptr)
            {
                nodeElement.setAttribute("type", "output");
            }
            else if (const auto* osc = dynamic_cast<const Oscillator*>(node.get()))
            {
                nodeElement.setAttribute("type", "operator");
                nodeElement.setAttribute("frequencyRatio", osc->frequencyRatio);
                nodeElement.setAttribute("amplitude", osc->amplitude);
                nodeElement.setAttribute("attack", osc->envelope.getAttack());
                nodeElement.setAttribute("decay", osc->envelope.getDecay());
                nodeElement.setAttribute("sustain", osc->envelope.getSustain());
                nodeElement.setAttribute("release", osc->envelope.getRelease());
            }
            else
            {
                nodeElement.setAttribute("type", "unknown");
            }

            nodesElement.addChildElement(new juce::XmlElement(nodeElement));
        }

        juce::XmlElement connectionsElement("CONNECTIONS");
        for (const auto& connection : connections)
        {
            juce::XmlElement connectionElement("CONNECTION");
            connectionElement.setAttribute("id", static_cast<int>(connection.id));
            connectionElement.setAttribute("source", static_cast<int>(connection.source));
            connectionElement.setAttribute("destination", static_cast<int>(connection.destination));
            connectionElement.setAttribute("amount", connection.ammount);
            connectionElement.setAttribute("type", connection.type == ConnectionType::gain ? "gain" : "modulation");
            connectionsElement.addChildElement(new juce::XmlElement(connectionElement));
        }

        state.addChildElement(new juce::XmlElement(nodesElement));
        state.addChildElement(new juce::XmlElement(connectionsElement));
        return state;
    }

    bool DSPGraph::loadStateXml(const juce::XmlElement& state, NodeID& outputNodeId, NodeID& operatorNodeId)
    {
        if (!state.hasTagName("DSP_GRAPH_STATE"))
            return false;

        nodes.clear();
        connections.clear();
        processingOrder.clear();
        this->nodePositions.clear();

        outputNodeID = static_cast<NodeID>(state.getIntAttribute("outputNodeId", 0));
        nextNodeID = static_cast<NodeID>(state.getIntAttribute("nextNodeID", 1));
        nextConnectionID = static_cast<ConnectionID>(state.getIntAttribute("nextConnectionID", 1));
        outputNodeId = outputNodeID;
        operatorNodeId = 0;

        if (const auto* nodesElement = state.getChildByName("NODES"))
        {
            for (const auto* nodeElement : nodesElement->getChildWithTagNameIterator("NODE"))
            {
                const auto id = static_cast<NodeID>(nodeElement->getIntAttribute("id", 0));
                if (id == 0)
                    continue;

                const auto type = nodeElement->getStringAttribute("type").toLowerCase();
                std::unique_ptr<DSPNode> node;

                if (type == "output")
                {
                    node = std::make_unique<Output>();
                }
                else if (type == "operator" || type == "oscillator")
                {
                    auto osc = std::make_unique<Oscillator>();
                    osc->setFrequencyRatio(static_cast<float>(nodeElement->getDoubleAttribute("frequencyRatio", 1.0)));
                    osc->setAmplitude(static_cast<float>(nodeElement->getDoubleAttribute("amplitude", 0.5)));
                    osc->setAttack(static_cast<float>(nodeElement->getDoubleAttribute("attack", 0.01)));
                    osc->setDecay(static_cast<float>(nodeElement->getDoubleAttribute("decay", 0.1)));
                    osc->setSustain(static_cast<float>(nodeElement->getDoubleAttribute("sustain", 0.7)));
                    osc->setRelease(static_cast<float>(nodeElement->getDoubleAttribute("release", 0.3)));
                    node = std::move(osc);

                    if (operatorNodeId == 0)
                        operatorNodeId = id;
                }

                if (node != nullptr)
                {
                    node->nodeId = id;
                    nodes[id] = std::move(node);

                    if (nodeElement->hasAttribute("x") && nodeElement->hasAttribute("y"))
                    {
                        this->nodePositions[id] = {
                            static_cast<float>(nodeElement->getDoubleAttribute("x", 0.0)),
                            static_cast<float>(nodeElement->getDoubleAttribute("y", 0.0))
                        };
                    }
                }
            }
        }

        if (const auto* connectionsElement = state.getChildByName("CONNECTIONS"))
        {
            for (const auto* connectionElement : connectionsElement->getChildWithTagNameIterator("CONNECTION"))
            {
                const auto id = static_cast<ConnectionID>(connectionElement->getIntAttribute("id", 0));
                const auto source = static_cast<NodeID>(connectionElement->getIntAttribute("source", 0));
                const auto destination = static_cast<NodeID>(connectionElement->getIntAttribute("destination", 0));
                const auto amount = static_cast<float>(connectionElement->getDoubleAttribute("amount", 1.0));
                const auto typeText = connectionElement->getStringAttribute("type", "modulation").toLowerCase();
                const auto type = typeText == "gain" ? ConnectionType::gain : ConnectionType::modulation;

                if (id == 0 || source == 0 || destination == 0)
                    continue;

                if (nodes.find(source) != nodes.end() && nodes.find(destination) != nodes.end())
                    connections.push_back({id, source, destination, amount, type});
            }
        }

        if (outputNodeID == 0 || nodes.find(outputNodeID) == nodes.end())
        {
            for (const auto& [id, node] : nodes)
            {
                if (dynamic_cast<Output*>(node.get()) != nullptr)
                {
                    outputNodeID = id;
                    outputNodeId = id;
                    break;
                }
            }
        }

        if (nextNodeID <= nodes.size())
            nextNodeID = static_cast<NodeID>(nodes.size() + 1);

        if (nextConnectionID <= connections.size())
            nextConnectionID = static_cast<ConnectionID>(connections.size() + 1);

        updateProcessingOrder();
        return !nodes.empty();
    }

    juce::var DSPGraph::createSnapshotVar(NodeID outputNodeId, NodeID operatorNodeId) const
    {
        juce::var snapshot = new juce::DynamicObject();
        juce::Array<juce::var> nodeArray;
        juce::Array<juce::var> connectionArray;

        for (const auto& [id, node] : nodes)
        {
            juce::var nodeVar = new juce::DynamicObject();
            auto* nodeObject = nodeVar.getDynamicObject();
            nodeObject->setProperty("id", static_cast<int>(id));

            if (dynamic_cast<const Output*>(node.get()) != nullptr)
            {
                nodeObject->setProperty("type", "output");
            }
            else if (const auto* osc = dynamic_cast<const Oscillator*>(node.get()))
            {
                nodeObject->setProperty("type", "operator");

                juce::var parameterData = new juce::DynamicObject();
                auto* params = parameterData.getDynamicObject();
                params->setProperty("frequencyRatio", osc->frequencyRatio);
                params->setProperty("amplitude", osc->amplitude);
                params->setProperty("attack", osc->envelope.getAttack());
                params->setProperty("decay", osc->envelope.getDecay());
                params->setProperty("sustain", osc->envelope.getSustain());
                params->setProperty("release", osc->envelope.getRelease());
                nodeObject->setProperty("data", parameterData);
            }
            else
            {
                nodeObject->setProperty("type", "unknown");
            }

            if (const auto positionIt = this->nodePositions.find(id); positionIt != this->nodePositions.end())
            {
                juce::var positionVar = new juce::DynamicObject();
                positionVar.getDynamicObject()->setProperty("x", positionIt->second.first);
                positionVar.getDynamicObject()->setProperty("y", positionIt->second.second);
                nodeObject->setProperty("position", positionVar);
            }

            nodeArray.add(nodeVar);
        }

        for (const auto& connection : connections)
        {
            juce::var connectionVar = new juce::DynamicObject();
            auto* connectionObject = connectionVar.getDynamicObject();
            connectionObject->setProperty("sourceNodeId", static_cast<int>(connection.source));
            connectionObject->setProperty("destNodeId", static_cast<int>(connection.destination));
            connectionObject->setProperty("amount", connection.ammount);
            connectionObject->setProperty("connectionType", connection.type == ConnectionType::gain ? "gain" : "modulation");
            connectionArray.add(connectionVar);
        }

        auto* snapshotObject = snapshot.getDynamicObject();
        snapshotObject->setProperty("nodes", juce::var(nodeArray));
        snapshotObject->setProperty("connections", juce::var(connectionArray));
        snapshotObject->setProperty("outputNodeId", static_cast<int>(outputNodeId));
        snapshotObject->setProperty("operatorNodeId", static_cast<int>(operatorNodeId));
        return snapshot;
    }
}