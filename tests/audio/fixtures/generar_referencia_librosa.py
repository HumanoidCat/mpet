#!/usr/bin/env python3
"""
S5-T2 — Genera el fixture de referencia de librosa para validar los MFCC.

Se corre UNA vez, fuera del proyecto, y su salida (`mfcc-librosa.json`) se
versiona en el repositorio. Las pruebas comparan contra ese archivo, de modo
que ni el proyecto ni el navegador incorporan dependencias nuevas — que es la
resolución que tomó el PM al descartar Meyda.

    pip install librosa numpy
    python generar_referencia_librosa.py

Los parámetros de abajo tienen que coincidir exactamente con los del proyecto.
Dos que importan y suelen pasarse por alto:

  htk=True      La implementación usa la fórmula de HTK, m = 2595·log10(1+f/700).
                El valor por defecto de librosa (htk=False) usa la variante de
                Slaney, que da un banco de filtros distinto.

  norm=None     Sin normalización por área de los filtros. El defecto de librosa
                ('slaney') escala cada filtro por su ancho.

  top_db=None   power_to_db por defecto recorta a 80 dB por debajo del máximo.
                El proyecto no recorta.

  center=False  Sin relleno simétrico: el proyecto trocea desde la muestra 0.
"""

import json
import numpy as np
import librosa

SAMPLE_RATE = 16000
FFT_SIZE = 512
HOP_SIZE = 256
N_MELS = 26
N_MFCC = 13


def seno(freq_hz, n, amp=1.0):
    i = np.arange(n)
    return amp * np.sin(2 * np.pi * freq_hz * i / SAMPLE_RATE)


def vocal(f0, formantes, n, amp=1.0):
    """Misma síntesis que en tests/audio/mfcc.test.ts."""
    out = np.zeros(n)
    k = 1
    while k * f0 < SAMPLE_RATE / 2:
        f = f0 * k
        g = 0.05 + sum(1 / (1 + ((f - F) / 100) ** 2) for F in formantes)
        out += seno(f, n, amp * g)
        k += 1
    return out


def ruido(n, amp=1.0, semilla=3):
    """Mismo generador congruencial lineal que las pruebas, para que coincida."""
    out = np.zeros(n)
    s = semilla
    for i in range(n):
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        out[i] = ((s / 0x7FFFFFFF) * 2 - 1) * amp
    return out


def mfcc_de(senal):
    """MFCC de una sola trama, con los parámetros del proyecto."""
    S = np.abs(librosa.stft(
        senal.astype(np.float32),
        n_fft=FFT_SIZE,
        hop_length=HOP_SIZE,
        win_length=FFT_SIZE,
        window="hann",
        center=False,
    )) ** 2

    mel = librosa.feature.melspectrogram(
        S=S, sr=SAMPLE_RATE, n_mels=N_MELS, htk=True, norm=None, fmin=0, fmax=SAMPLE_RATE / 2
    )
    log_mel = librosa.power_to_db(mel, ref=1.0, top_db=None)
    coef = librosa.feature.mfcc(S=log_mel, n_mfcc=N_MFCC)
    return coef[:, 0].tolist()  # primera trama


CASOS = {
    "tono_1000hz": seno(1000, FFT_SIZE),
    "tono_440hz": seno(440, FFT_SIZE),
    "vocal_a": vocal(120, [700, 1200, 2600], FFT_SIZE),
    "vocal_i": vocal(120, [300, 2300, 3000], FFT_SIZE),
    "vocal_u": vocal(120, [350, 800, 2400], FFT_SIZE),
    "ruido": ruido(FFT_SIZE),
}

referencia = {
    "_generado_por": "tests/audio/fixtures/generar_referencia_librosa.py",
    "_librosa": librosa.__version__,
    "parametros": {
        "sampleRate": SAMPLE_RATE,
        "fftSize": FFT_SIZE,
        "hopSize": HOP_SIZE,
        "nMels": N_MELS,
        "nMfcc": N_MFCC,
        "htk": True,
        "norm": None,
    },
    "casos": {nombre: mfcc_de(senal) for nombre, senal in CASOS.items()},
}

with open("mfcc-librosa.json", "w", encoding="utf-8") as f:
    json.dump(referencia, f, indent=2)

print(f"Escrito mfcc-librosa.json con {len(CASOS)} casos (librosa {librosa.__version__})")
