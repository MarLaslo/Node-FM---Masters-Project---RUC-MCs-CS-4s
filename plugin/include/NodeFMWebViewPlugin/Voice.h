#pragma once
#include "dsp/Oscillator.h"
#include "dsp/Output.h"
#include "graph/DSPGraph.h"
#include <memory>

namespace nodefm_plugin
{
    struct Voice
    {
        int note;
        std::shared_ptr<DSPGraph> graph;
        float sampleRate;
        NodeID outputNodeID;
        NodeID operatorNodeID;

        Voice() : note(0), sampleRate(44100.0f), outputNodeID(0), operatorNodeID(0)
        {
            graph = std::make_shared<DSPGraph>();

            auto outputNode = std::make_unique<Output>();
            outputNodeID = graph->addNode(std::move(outputNode));
            graph->setOutputNode(outputNodeID);

            auto operatorNode = std::make_unique<Oscillator>();
            operatorNode->setSampleRate(sampleRate);
            operatorNode->setFrequencyRatio(1.0f);
            operatorNode->setAmplitude(0.5f);
            operatorNode->setAttack(0.01f);
            operatorNode->setDecay(0.1f);
            operatorNode->setSustain(0.7f);
            operatorNode->setRelease(0.3f);
            operatorNodeID = graph->addNode(std::move(operatorNode));

            graph->addConnection(operatorNodeID, outputNodeID, 1.0f, ConnectionType::gain);
        }

        void reset()
        {
            note = 0;
        }

        void setSampleRate(float sr)
        {
            sampleRate = sr;
            if (graph)
            {
                graph->setSampleRate(sr);
            }
        }
        
        void setNoteFrequency(float freq)
        {
            if (graph)
            {
                graph->setNoteFrequency(freq);
            }
        }
        
        void noteOn()
        {
            if (graph)
            {
                graph->noteOn();
            }
        }
        
        void noteOff()
        {
            if (graph)
            {
                graph->noteOff();
            }
        }
        
        bool isEnvelopeActive() const
        {
            if (graph)
            {
                return graph->isAnyEnvelopeActive();
            }
            return false;
        }
        
        void render(float* outputBuffer, int numSamples)
        {
            if (graph && (note > 0 || isEnvelopeActive()))
            {
                graph->process(outputBuffer, numSamples);
            }
            else
            {
                // Fill buffer with silence
                for (int i = 0; i < numSamples; ++i)
                {
                    outputBuffer[i] = 0.0f;
                }
            }
        }
    };
}