#include "NodeFMWebViewPlugin/graph/DSPGraph.h"
#include "NodeFMWebViewPlugin/dsp/Oscillator.h"
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

    ConnectionID DSPGraph::addConnection(NodeID source, NodeID dest, float amount)
    {
        ConnectionID id = nextConnectionID++;
        connections.push_back({id, source, dest, amount});
        
        DBG("Added connection: Node " << (int)source << " -> Node " << (int)dest << " (amount: " << amount << ")");
        
        updateProcessingOrder(); // Recalculate topological order
        return id;
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
                                        node->addModulation(sourceOut[0] * conn.ammount);
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
        
        // Reset ID counters
        nextNodeID = 1;
        nextConnectionID = 1;
        outputNodeID = 0;
        
        DBG("Graph cleared successfully");
    }}