#pragma once
#include <cmath>
#include "../graph/DSPNode.h"
#include "ADSR.h"

namespace nodefm_plugin
{
    const float TWO_PI = 6.2831853071795864f;

    class Oscillator : public DSPNode
    {
    public:
        Oscillator()
        {
            outputBuffer.setSize(1, 1, false, false, true);
            outputBuffer.clear();
        }

        float amplitude{0.5f};
        float frequencyRatio{1.0f};  // FM ratio (e.g., 1.0, 2.0, 0.5)
        float velocityAmount{1.0f};
        float baseFrequency{440.0f}; // Base frequency in Hz
        float inc{0.0f};             // Phase increment
        float phase{0.0f};
        ADSR envelope;
        
        void setFrequency(float freq)
        {
            baseFrequency = freq;
            updateIncrement();
        }
        
        void setFrequencyRatio(float ratio)
        {
            frequencyRatio = ratio;
            updateIncrement();
        }
        
        void setSampleRate(float sr)
        {
            sampleRate = sr;
            envelope.setSampleRate(sr);
            updateIncrement();
        }
        
        void setAmplitude(float amp)
        {
            amplitude = amp;
        }

        void setVelocityAmount(float amount)
        {
            velocityAmount = juce::jlimit(0.0f, 1.0f, amount);
        }
        
        // ADSR envelope controls
        void noteOn(float velocity = 1.0f)
        {
            noteVelocity = juce::jlimit(0.0f, 1.0f, velocity);
            envelope.noteOn();
        }
        
        void noteOff()
        {
            envelope.noteOff();
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

        void process(int numSamples) override
        {
            outputBuffer.setSize(1, numSamples, false, false, true);
            float *output = outputBuffer.getWritePointer(0);

            for (int i = 0; i < numSamples; ++i)
            {
                output[i] = nextSample();
            }
        }

        void reset() override
        {
            phase = 0.0f;
            inputSignal = 0.0f;
            modulationInput = 0.0f;
            noteVelocity = 1.0f;
            envelope.reset();
        }

        void setModulation(float value) override
        {
            // Phase modulation is additive
            modulationInput = value;
        }

    private:
        float sampleRate{44100.0f};
        
        void updateIncrement()
        {
            if (sampleRate > 0.0f)
            {
                inc = (baseFrequency * frequencyRatio) / sampleRate;
            }
        }
        
        float nextSample()
        {
            float modulatedPhase = phase + modulationInput;
            phase += inc;
            if (phase >= 1.0f)
                phase -= 1.0f;
            
            float envelopeLevel = envelope.nextSample();
            const float velocityGain = (1.0f - velocityAmount) + (velocityAmount * noteVelocity);
            return amplitude * velocityGain * envelopeLevel * std::sin(TWO_PI * modulatedPhase);
        }

        float noteVelocity{1.0f};
    };
}