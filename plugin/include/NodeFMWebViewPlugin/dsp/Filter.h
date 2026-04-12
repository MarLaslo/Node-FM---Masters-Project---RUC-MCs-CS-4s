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

    enum class FilterSlope
    {
        slope12dB,
        slope24dB
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
            ic1eqStage1 = 0.0f;
            ic2eqStage1 = 0.0f;
            ic1eqStage2 = 0.0f;
            ic2eqStage2 = 0.0f;
            smoothedCutoffHz = cutoffHz;
            envelope.reset();
            outputBuffer.clear();
        }

        void setSampleRate(float sr)
        {
            sampleRate = std::max(1.0f, sr);
            envelope.setSampleRate(sampleRate);
            const float smoothingTimeSeconds = 0.0025f;
            cutoffSmoothingCoeff = std::exp(-1.0f / (smoothingTimeSeconds * sampleRate));
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

        void setSlope(FilterSlope newSlope)
        {
            slope = newSlope;
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
        FilterSlope getSlope() const { return slope; }
        ADSR& getEnvelope() { return envelope; }
        const ADSR& getEnvelope() const { return envelope; }

        juce::String getSlopeString() const
        {
            return slope == FilterSlope::slope24dB ? "24db" : "12db";
        }

    private:
        float sampleRate{44100.0f};
        float cutoffHz{1200.0f};
        float smoothedCutoffHz{1200.0f};
        float resonanceQ{0.707f};
        float envelopeAmountHz{2000.0f};
        FilterMode mode{FilterMode::lowpass};
        FilterSlope slope{FilterSlope::slope12dB};
        float cutoffSmoothingCoeff{0.995f};

        float ic1eqStage1{0.0f};
        float ic2eqStage1{0.0f};
        float ic1eqStage2{0.0f};
        float ic2eqStage2{0.0f};
        ADSR envelope;

        struct StageOutputs
        {
            float lowpass{0.0f};
            float bandpass{0.0f};
            float highpass{0.0f};
        };

        static float selectModeOutput(const StageOutputs& outputs, FilterMode currentMode)
        {
            switch (currentMode)
            {
            case FilterMode::lowpass:
                return outputs.lowpass;
            case FilterMode::bandpass:
                return outputs.bandpass;
            case FilterMode::highpass:
                return outputs.highpass;
            }

            return outputs.lowpass;
        }

        static bool isFinite(float value)
        {
            return std::isfinite(value);
        }

        static float limitResonanceNearNyquist(float requestedQ, float normalizedCutoff)
        {
            const float nyquistStress = std::clamp((normalizedCutoff - 0.35f) / 0.12f, 0.0f, 1.0f);
            const float maxStableQ = juce::jmap(nyquistStress, 20.0f, 8.0f);
            return std::min(requestedQ, maxStableQ);
        }

        StageOutputs processStage(float x, float normalizedCutoff, float q, float& ic1eq, float& ic2eq)
        {
            const float g = std::tan(juce::MathConstants<float>::pi * normalizedCutoff);
            const float k = 1.0f / q;
            const float a1 = 1.0f / (1.0f + g * (g + k));
            const float a2 = g * a1;
            const float a3 = g * a2;

            if (!isFinite(g) || !isFinite(a1) || !isFinite(a2) || !isFinite(a3))
                return {};

            const float v3 = x - ic2eq;
            const float v1 = a1 * ic1eq + a2 * v3;
            const float v2 = ic2eq + a2 * ic1eq + a3 * v3;

            if (!isFinite(v1) || !isFinite(v2) || !isFinite(v3))
                return {};

            ic1eq = 2.0f * v1 - ic1eq;
            ic2eq = 2.0f * v2 - ic2eq;

            if (!isFinite(ic1eq) || !isFinite(ic2eq))
            {
                ic1eq = 0.0f;
                ic2eq = 0.0f;
                return {};
            }

            return {v2, v1, v3 - k * v1};
        }

        float processSingleSample(float x)
        {
            const float envValue = envelope.nextSample();
            const float maxCutoffHz = std::min(20000.0f, sampleRate * 0.45f);
            const float targetCutoff = std::clamp(cutoffHz + envelopeAmountHz * envValue, 20.0f, maxCutoffHz);
            smoothedCutoffHz = cutoffSmoothingCoeff * smoothedCutoffHz + (1.0f - cutoffSmoothingCoeff) * targetCutoff;

            const float normalizedCutoff = std::clamp(smoothedCutoffHz / sampleRate, 0.00045f, 0.47f);
            const float safeQ = limitResonanceNearNyquist(resonanceQ, normalizedCutoff);

            const auto stage1 = processStage(x, normalizedCutoff, safeQ, ic1eqStage1, ic2eqStage1);
            if (slope == FilterSlope::slope12dB)
                return selectModeOutput(stage1, mode);

            const auto cascadedInput = selectModeOutput(stage1, mode);
            const auto stage2 = processStage(cascadedInput, normalizedCutoff, safeQ, ic1eqStage2, ic2eqStage2);
            return selectModeOutput(stage2, mode);
        }

    };
}