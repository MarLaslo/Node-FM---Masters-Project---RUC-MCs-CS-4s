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

    enum class FilterCurve
    {
        db12,
        db24
    };

    inline FilterMode filterModeFromString(const juce::String& modeText)
    {
        const auto normalized = modeText.toLowerCase();

        if (normalized == "highpass" || normalized == "hp")
            return FilterMode::highpass;
        if (normalized == "bandpass" || normalized == "bp")
            return FilterMode::bandpass;

        return FilterMode::lowpass;
    }

    inline juce::String filterModeToString(FilterMode mode)
    {
        switch (mode)
        {
        case FilterMode::lowpass:
            return "lowpass";
        case FilterMode::bandpass:
            return "bandpass";
        case FilterMode::highpass:
            return "highpass";
        }

        return "lowpass";
    }

    inline FilterCurve filterCurveFromString(const juce::String& curveText)
    {
        const auto normalized = curveText.toLowerCase();

        if (normalized.contains("24"))
            return FilterCurve::db24;

        return FilterCurve::db12;
    }

    inline juce::String filterCurveToString(FilterCurve curve)
    {
        return curve == FilterCurve::db24 ? "24db" : "12db";
    }

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
                output[i] = processSingleSample(inputSignal);
            }
        }

        void reset() override
        {
            inputSignal = 0.0f;
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

        void setFilterCurve(FilterCurve newCurve)
        {
            curve = newCurve;
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
        FilterCurve getFilterCurve() const { return curve; }
        ADSR& getEnvelope() { return envelope; }
        const ADSR& getEnvelope() const { return envelope; }

    private:
        float sampleRate{44100.0f};
        float cutoffHz{1200.0f};
        float resonanceQ{0.707f};
        float envelopeAmountHz{2000.0f};
        FilterMode mode{FilterMode::lowpass};
        FilterCurve curve{FilterCurve::db12};

        float ic1eq{0.0f};
        float ic2eq{0.0f};
        float ic3eq{0.0f};
        float ic4eq{0.0f};
        ADSR envelope;

        float processStage(float x, float g, float q, float& ic1, float& ic2)
        {
            const float k = 1.0f / std::max(0.1f, q);
            const float a1 = 1.0f / (1.0f + g * (g + k));
            const float a2 = g * a1;
            const float a3 = g * a2;

            const float v3 = x - ic2;
            const float v1 = a1 * ic1 + a2 * v3;
            const float v2 = ic2 + a2 * ic1 + a3 * v3;

            ic1 = 2.0f * v1 - ic1;
            ic2 = 2.0f * v2 - ic2;

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

        float processSingleSample(float x)
        {
            const float envValue = envelope.nextSample();
            const float maxCutoff = std::max(20.0f, sampleRate * 0.45f);
            const float modulatedCutoff = std::clamp(cutoffHz + envelopeAmountHz * envValue, 20.0f, maxCutoff);
            const float normalizedCutoff = std::clamp(modulatedCutoff / sampleRate, 0.00045f, 0.45f);

            const float g = std::tan(juce::MathConstants<float>::pi * normalizedCutoff);

            float filtered = processStage(x, g, resonanceQ, ic1eq, ic2eq);

            if (curve == FilterCurve::db24)
            {
                filtered = processStage(filtered, g, resonanceQ, ic3eq, ic4eq);
            }

            return filtered;
        }

    };
}