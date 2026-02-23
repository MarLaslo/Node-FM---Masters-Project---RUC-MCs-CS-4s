#pragma once
#include <juce_audio_basics/juce_audio_basics.h>
#include "../GraphTypes.h"

namespace nodefm_plugin
{
    class DSPNode
    {

    public:
        virtual ~DSPNode() = default;

        virtual void process(int numSamples) = 0;
        virtual void reset() = 0;

        float *getOutput() { return outputBuffer.getWritePointer(0); }
        
        virtual void resetModulation() { modulationInput = 0.0f; }
        virtual void addModulation(float value) { modulationInput += value; }
        virtual void setModulation(float value) { modulationInput = value; } 
        virtual void addInput(DSPNode *source, float amount) {}

        NodeID nodeId;

    protected:
        juce::AudioBuffer<float> outputBuffer;
        float modulationInput = 0.0f;

    };
}