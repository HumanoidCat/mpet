import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, FancyArrowPatch
from matplotlib.path import Path
import matplotlib.patches as mpatches

FONT = "DejaVu Serif"
plt.rcParams["font.family"] = FONT

fig, ax = plt.subplots(figsize=(9.6, 6.4))
ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")

GREY = "#f2f2f2"
EDGE = "#333333"

def band(x0, y0, x1, y1, title, lx=1.2):
    ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, facecolor="none",
                           edgecolor="#888888", linestyle=(0, (4, 3)), linewidth=1.0))
    ax.text(x0 + lx, y1 - 2.4, title, fontsize=8.5, style="italic", color="#444444",
            ha="left", va="center")

def box(x0, y0, x1, y1, text, fs=8.0):
    ax.add_patch(FancyBboxPatch((x0, y0), x1 - x0, y1 - y0,
                                boxstyle="round,pad=0,rounding_size=1.2",
                                facecolor=GREY, edgecolor=EDGE, linewidth=1.0))
    ax.text((x0 + x1) / 2, (y0 + y1) / 2, text, fontsize=fs, ha="center", va="center",
            wrap=True, linespacing=1.35)
    return ((x0 + x1) / 2, (y0 + y1) / 2, x0, y0, x1, y1)

def arrow(p0, p1, style="-", label=None, lp=None, dashed=False):
    ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="-|>", mutation_scale=11,
                                 linewidth=1.0, color=EDGE,
                                 linestyle=(0, (3, 3)) if dashed else "solid",
                                 shrinkA=0, shrinkB=0))
    if label:
        ax.text(lp[0], lp[1], label, fontsize=7.0, ha="center", va="center",
                style="italic", color="#333333",
                bbox=dict(facecolor="white", edgecolor="none", pad=1.0))

def elbow(pts, label=None, lp=None):
    for a, b in zip(pts[:-1], pts[1:-1]):
        ax.plot([a[0], b[0]], [a[1], b[1]], color=EDGE, linewidth=1.0, solid_capstyle="round")
    arrow(pts[-2], pts[-1])
    if label:
        ax.text(lp[0], lp[1], label, fontsize=7.0, ha="center", va="center", style="italic",
                color="#333333", bbox=dict(facecolor="white", edgecolor="none", pad=1.0))

# ---- Interfaz ----
band(4, 78, 96, 94, "Interfaz de usuario")
CHAT = box(8, 80, 48, 89.5, "Chat y retroalimentacion\nvisual")
VIS = box(52, 80, 92, 89.5, "Visualizador: forma de onda,\nespectrograma, tono")

# ---- Motor de audio ----
band(4, 53, 96, 72, "Motor de audio · procesamiento digital de senales")
CAP = box(6, 56, 27, 68, "Captura\ngetUserMedia +\nAudioWorklet\n48 kHz")
PRE = box(30, 56, 51, 68, "Preprocesamiento\ndecimacion x3, FIR,\npasa-banda, RMS,\nVAD  -> 16 kHz")
FEAT = box(54, 56, 75, 68, "Caracteristicas\nFFT / STFT, MFCC,\ntono YIN, energia")
COMP = box(78, 56, 94, 68, "Comparador\nacustico\nDTW y puntaje")

# ---- Pipeline de IA ----
band(4, 26, 96, 45, "Canal de inferencia en el navegador", lx=50)
ASR = box(30, 29, 51, 41, "Reconocimiento\nWhisper-tiny multilingue\ncuantizado (q8)")
GRAM = box(54, 29, 75, 41, "Correccion\ngramatical\nT5 base (q8)")
SUG = box(78, 29, 94, 41, "Tutor y sugerencias\nLaMini-Flan-T5\n248M (q8)")
TTS = box(6, 29, 27, 41, "Sintesis de voz\nKokoro-82M (q8)\n(audio de referencia)")

# ---- Nucleo y PWA ----
band(4, 4, 96, 20, "Nucleo, aplicacion web progresiva y almacenamiento")
BUS = box(8, 6, 36, 15.5, "Bus de eventos\ny orquestador")
SW = box(40, 6, 62, 15.5, "Service Worker\n+ Cache API")
DB = box(66, 6, 92, 15.5, "IndexedDB\nsesiones y progreso")

# ---- Flujo dentro del motor de audio ----
arrow((27, 62), (30, 62))
arrow((51, 62), (54, 62))
arrow((75, 62), (78, 62))

# ---- Flujo dentro del pipeline de IA ----
arrow((51, 35), (54, 35))
arrow((75, 35), (78, 35))

# ---- Preprocesamiento -> ASR ----
arrow((40.5, 56), (40.5, 41), label="PCM 16 kHz", lp=(40.5, 48.5))

# ---- Sugerencias -> TTS (vuelta por debajo del carril de IA) ----
elbow([(86, 29), (86, 23.2), (16.5, 23.2), (16.5, 29)])

# ---- TTS -> Comparador (referencia acustica) ----
elbow([(16.5, 41), (16.5, 49.5), (98, 49.5), (98, 62), (94, 62)],
      label="audio de referencia", lp=(56, 49.5))

# ---- Caracteristicas -> Visualizador ----
arrow((64.5, 68), (68, 80))

# ---- Comparador -> Chat ----
elbow([(86, 68), (86, 96), (28, 96), (28, 89.5)], label="puntaje por palabra", lp=(57, 96))

# ---- Correccion gramatical -> Chat ----
elbow([(64.5, 29), (64.5, 24.8), (2, 24.8), (2, 84.7), (8, 84.7)], label="ediciones", lp=(2, 58.5))

# ---- Orquestacion ----
arrow((22, 15.5), (22, 21.6), dashed=True)
arrow((51, 15.5), (51, 21.5), dashed=True)
arrow((62, 10.75), (66, 10.75))

fig.savefig("/tmp/arquitectura-final.png", dpi=220, bbox_inches="tight", facecolor="white")
print("ok")
