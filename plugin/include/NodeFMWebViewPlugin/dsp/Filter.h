#pragma once
#include <algorithm>
#include <cmath>
#include "../graph/DSPNode.h"
#include "ADSR.h"

namespace nodefm_plugin
{
    enum class FilterMode
    {
        lowpass,
        bandpass,
        highpass
    };

    class Filter : public DSPNode
    {
    public:
        Filter()
        {
            outputBuffer.setSize(1, 1, false, false, true);
            outputBuffer.clear();
        }

        void process(int numSamples) override
        {
            outputBuffer.setSize(1, numSamples, false, false, true);
            float* output = outputBuffer.getWritePointer(0);

            for (int i = 0; i < numSamples; ++i)
            {
                output[i] = processSingleSample(modulationInput);
            }
        }

        void reset() override
        {
            modulationInput = 0.0f;
            ic1eq = 0.0f;
            ic2eq = 0.0f;
            envelope.reset();
            outputBuffer.clear();
        }

        void setSampleRate(float sr)
        {
            sampleRate = std::max(1.0f, sr);
            envelope.setSampleRate(sampleRate);
        }

        void setCutoff(float hz)
        {
            cutoffHz = std::clamp(hz, 20.0f, 20000.0f);
        }

        void setResonance(float q)
        {
            resonanceQ = std::clamp(q, 0.1f, 20.0f);
        }

        void setFilterMode(FilterMode newMode)
        {
            mode = newMode;
        }

        void setEnvelopeAmount(float amountHz)
        {
            envelopeAmountHz = amountHz;
        }

        void setAttack(float seconds)
        {
            envelope.setAttack(seconds);
        }

        void setDecay(float seconds)
        {
            envelope.setDecay(seconds);
        }

        void setSustain(float level)
        {
            envelope.setSustain(level);
        }

        void setRelease(float seconds)
        {
            envelope.setRelease(seconds);
        }

        void noteOn()
        {
            envelope.noteOn();
        }

        void noteOff()
        {
            envelope.noteOff();
        }

        bool isEnvelopeActive() const
        {
            return envelope.isActive();
        }

        float getCutoff() const { return cutoffHz; }
        float getResonance() const { return resonanceQ; }
        float getEnvelopeAmount() const { return envelopeAmountHz; }
        FilterMode getFilterMode() const { return mode; }
        ADSR& getEnvelope() { return envelope; }
        const ADSR& getEnvelope() const { return envelope; }

    private:
        float sampleRate{44100.0f};
        float cutoffHz{1200.0f};
        float resonanceQ{0.707f};
        float envelopeAmountHz{2000.0f};
        FilterMode mode{FilterMode::lowpass};

        float ic1eq{0.0f};
        float ic2eq{0.0f};
        ADSR envelope;

        float processSingleSample(float x)
        {
            const float envValue = envelope.nextSample();
            const float modulatedCutoff = std::clamp(cutoffHz + envelopeAmountHz * envValue, 20.0f, 20000.0f);
            const float normalizedCutoff = std::clamp(modulatedCutoff / sampleRate, 0.00045f, 0.49f);

            const float g = std::tan(juce::MathConstants<float>::pi * normalizedCutoff);
            const float k = 1.0f / resonanceQ;
            const float a1 = 1.0f / (1.0f + g * (g + k));
            const float a2 = g * a1;
            const float a3 = g * a2;

            const float v3 = x - ic2eq;
            const float v1 = a1 * ic1eq + a2 * v3;
            const float v2 = ic2eq + a2 * ic1eq + a3 * v3;

            ic1eq = 2.0f * v1 - ic1eq;
            ic2eq = 2.0f * v2 - ic2eq;

            switch (mode)
            {
            case FilterMode::lowpass:
                return v2;
            case FilterMode::bandpass:
                return v1;
            case FilterMode::highpass:
                return v3 - k * v1;
            }

            return v2;
        }

    };
}