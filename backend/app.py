from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Carrier(BaseModel):
    frequency: float = 1000.0
    amplitude: float = 1.0
    waveform: str = "sine"  # 'sine' or 'square'

class Message(BaseModel):
    bits: list[int] | str

class ModRequest(BaseModel):
    modulation: str  # 'ASK','PSK','FSK','PWM','PPM'
    carrier: Carrier
    message: Message
    cycles_per_symbol: int = 3
    samples_per_symbol: int = 64

def bits_to_array(bits):
    if isinstance(bits, str):
        return [1 if ch == '1' else 0 for ch in bits]
    return [1 if b else 0 for b in bits]

def gen_time_vec(symbol_duration, samples_per_symbol):
    return np.linspace(0, symbol_duration, samples_per_symbol, endpoint=False)

@app.post("/modulate")
def modulate(req: ModRequest):
    bits = bits_to_array(req.message.bits)
    carrier = req.carrier
    fc = max(1e-6, carrier.frequency)
    cycles = max(1, req.cycles_per_symbol)
    samples_per_symbol = max(4, req.samples_per_symbol)

    symbol_duration = cycles / fc
    total_samples = samples_per_symbol * max(1, len(bits))
    out = np.zeros(total_samples, dtype=float)

    for i, bit in enumerate(bits if bits else [1]):
        t = gen_time_vec(symbol_duration, samples_per_symbol)
        base_phase = 0.0

        if req.modulation.upper() == "ASK":
            A = carrier.amplitude if bit else carrier.amplitude * 0.05
            carrier_wave = np.sin(2*np.pi*fc*t + base_phase) if carrier.waveform=="sine" else np.sign(np.sin(2*np.pi*fc*t))
            samples = A * carrier_wave

        elif req.modulation.upper() == "PSK":
            phase = 0.0 if bit==0 else np.pi
            samples = carrier.amplitude * np.sin(2*np.pi*fc*t + phase)

        elif req.modulation.upper() == "FSK":
            f0 = fc * 0.8
            f1 = fc * 1.25
            f = f1 if bit else f0
            samples = carrier.amplitude * np.sin(2*np.pi*f*t)

        elif req.modulation.upper() == "PWM":
            # simple PWM: duty 75% for 1, 25% for 0
            duty = 0.75 if bit else 0.25
            frac = np.arange(samples_per_symbol)/samples_per_symbol
            samples = carrier.amplitude * (frac < duty).astype(float)

        elif req.modulation.upper() == "PPM":
            # narrow pulse at pos 20% (0) or 70% (1)
            pulse_width = max(1, int(samples_per_symbol*0.08))
            pos = int(samples_per_symbol*0.2) if bit==0 else int(samples_per_symbol*0.7)
            samples = np.zeros(samples_per_symbol)
            samples[pos:pos+pulse_width] = carrier.amplitude

        else:
            # fallback: plain carrier
            samples = carrier.amplitude * np.sin(2*np.pi*fc*t)

        out[i*samples_per_symbol:(i+1)*samples_per_symbol] = samples

    return {
        "type": "analog",
        "waveform": "modulated",
        "samples": out.tolist(),
        "source": req.modulation.upper(),
        "frequency": carrier.frequency,
        "amplitude": carrier.amplitude,
        "samples_per_symbol": samples_per_symbol,
    }
