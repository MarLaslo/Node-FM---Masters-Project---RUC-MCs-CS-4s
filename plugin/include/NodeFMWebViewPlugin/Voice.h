#pragma once
#include "Oscillator.h"
#include "Output.h"
#include "dsp/DSPGraph.h"
#include <memory>

namespace nodefm_plugin
{
    struct Voice
    {
        int note;
        std::shared_ptr<DSPGraph> graph;
        float sampleRate;
        NodeID outputNodeID;

        Voice() : note(0), sampleRate(44100.0f), outputNodeID(0)
        {
            graph = std::make_shared<DSPGraph>();
            
            // Add output node by default
            auto outputNode = std::make_unique<Output>();
            outputNodeID = graph->addNode(std::move(outputNode));
            graph->setOutputNode(outputNodeID);
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
            // Don't set note to 0 here - let it be cleared after envelopes finish
        }
        
        bool isEnvelopeActive() const
        {
            if (graph)
            {
                return graph->isAnyEnvelopeActive();
            }
            return false;
        }

        float render()
        {
            if (graph && (note > 0 || isEnvelopeActive()))
            {
                return graph->process();
            }
            return 0.0f;
        }
    };
}