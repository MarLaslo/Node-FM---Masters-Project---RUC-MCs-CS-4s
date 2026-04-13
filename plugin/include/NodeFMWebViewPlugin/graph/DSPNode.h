#pragma once
#include <juce_audio_basics/juce_audio_basics.h>
#include "GraphTypes.h"

namespace nodefm_plugin
{
    class DSPNode
    {

    public:
        virtual ~DSPNode() = default;

        virtual void process(int numSamples) = 0;
        virtual void reset() = 0;

        float *getOutput() { return outputBuffer.getWritePointer(0); }
        
        virtual void resetInput() { inputSignal = 0.0f; }
        virtual void resetModulation() { modulationInput = 0.0f; }
        virtual void addInput(float value) { inputSignal += value; }
        virtual void addModulation(float value) { modulationInput += value; }
        virtual void setModulation(float value) { modulationInput = value; } 

        NodeID nodeId;

    protected:
        juce::AudioBuffer<float> outputBuffer;
        float inputSignal = 0.0f;
        float modulationInput = 0.0f;

    };
}