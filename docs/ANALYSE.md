# Analyse préalable

But : un débruiteur gratuit, local et simple, pour remplacer iZotope RX De-noise sur des voix.

## StemKit (référence d'ergonomie)

StemKit 0.1.24 est une appli Electron (electron-vite, mise à jour via electron-updater) qui pilote
un Python embarqué : Demucs (htdemucs) et des modèles BS/Mel-RoFormer pour séparer des pistes.
Aucun fichier de licence n'est fourni dans le paquet : on ne réutilise rien de son code.
On garde l'esprit : une seule fenêtre, un glisser-déposer, tout en local.

## Briques libres comparées

| Brique | Licence | Qualité voix | Intégration Electron | Verdict |
|---|---|---|---|---|
| DeepFilterNet 3 | MIT / Apache-2.0 | Très bonne, pleine bande 48 kHz, temps réel | Binaire CLI officiel autonome (Rust, modèle intégré) pour macOS arm64/x64, Windows x64, Linux x64/arm64. Les modèles ONNX existent mais imposent de réécrire STFT, bandes ERB et filtrage profond en JS | **Retenu** (CLI officiel) |
| RNNoise | BSD-3 | Correcte, 48 kHz, plus « métallique » | WASM simple | Écarté : nettement moins bon que DFN3 |
| noisereduce | MIT | Gating spectral, artefacts musicaux | Python : embarquer un interpréteur | Écarté |
| UVR (modèles MDX/VR de débruitage) | Code MIT ; licence variable selon le modèle, souvent non précisée | Bonne sur certains bruits | Python + PyTorch, lourd | Écarté (licences floues, poids) |

## Un outil libre fait-il déjà tout ?

Presque : le CLI `deep-filter` fait déjà le débruitage, très bien et vite (environ 0,2 s pour 4 s de son
sur Apple Silicon). Il lui manque l'écoute avant/après, le réglage d'intensité en direct et l'export
pour un non-spécialiste. CHUT !!! est donc un habillage léger de ce CLI, sans réécrire le moteur.

## Choix techniques

- Décodage dans Chromium (`decodeAudioData`) : WAV, MP3, FLAC, OGG, M4A, sans ffmpeg.
- Rééchantillonnage à 48 kHz, débruitage une fois à fond (`--atten-lim-db 100`, délai compensé).
- Le curseur mélange en direct le signal d'origine et le signal débruité : même principe que
  l'option `--atten-lim-db` du moteur (0 % = original, 100 % = débruitage complet, entre les deux
  0 à 60 dB d'atténuation), sans relancer le calcul.
- Avant/après : deux lectures synchronisées dont on bascule les gains, sans coupure (idée reprise
  de la maquette Google AI Studio de Cédric).
- Export WAV 24 bits, 48 kHz.
