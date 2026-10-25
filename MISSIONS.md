# Chut !!! — MISSIONS / passation multi-agents

Mise à jour : 2026-10-25 (ChatGPT via Desktop Commander, Mac M4).

## Source de vérité
- Dépôt : https://github.com/cdriccarboni/chut
- Version publiée la plus récente contrôlée : **v2.0.0-beta.2**, commit `4f12ace`.
- GitHub Actions run `40183699057` : **SUCCESS** (macOS, Windows, Linux).
- Release : https://github.com/cdriccarboni/chut/releases/tag/v2.0.0-beta.2
- 8 livrables confirmés : macOS arm64 et x64 (DMG + ZIP), Windows x64 (setup + portable), Linux x64 (AppImage + DEB). Les systèmes Windows/Linux n'ont pas été testés physiquement ici.

## M4 : statut réellement vérifié
- Application `/Applications/Chut !!!.app` : version **2.0.0-beta.2** lue dans Info.plist.
- Signature `codesign --verify --deep` : OK.
- `npm test` : **23/23**.
- `npm run test:e2e` : **OK** ; signal synthétique : réduction du bruit 21,4265 dB, export WAV OK.
- Ne pas confondre tests synthétiques avec évaluation subjective sur de vraies voix.

## Mobile : état NON TERMINÉ
- `docs/app/` : atelier web avec manifeste et service worker présents. **PWA prototype**, filtres classiques; pas de DeepFilterNet WASM. Pas encore validée sur iPhone ou Android réel ni exhaustivement hors ligne.
- Modifications **non committées** dans `docs/app/manifest.webmanifest`, `docs/app/sw.js`, `docs/app/icon-512.png` : préserver et auditer avant toute publication.
- `mobile/android-shell/` : dépendances Capacitor installées dans un dossier **non suivi Git**; pas d'APK validé ou publié; pas de version Play Store confirmée.
- IPA iOS non signé : **non produit**.
- Trois cibles décidées : PWA installable iPhone/Android, APK Android GitHub et Play Store (tests internes d'abord), IPA non signé GitHub pour utilisateurs avancés.
- Ne pas annoncer la prise en charge mobile de DeepFilterNet ni l'installation Play Store tant qu'elles ne sont pas prouvées.

## Autres travaux en cours — NE PAS ÉCRASER
- `.ffmpeg-build/` et `scripts/build-ffmpeg.sh` sont non suivis Git : travaux d'un autre agent, à préserver. Vérifier licences, compatibilité, tailles, tests et intégration effective avant diffusion.
- `mobile/` et les modifications PWA sont également non suivis ou modifiés localement. Coordonner avec Grok avant de modifier.
- GitHub = source de vérité pour les travaux **validés** ; enregistrer chaque nouvelle preuve (tests, builds, appareil réel) dans ce fichier.
- Pas de force-push, pas de suppression de travail concurrent, pas de release stable sans validation.

## Priorités communes Grok / Claude / Antigravity / Pi / ChatGPT
1. Vérifier la PWA sur Safari iPhone et Chrome Android, mise en cache hors ligne, import/export WAV ; corriger seulement sur branche dédiée.
2. Étudier DeepFilterNet/WASM et limites mobiles (RAM, durée, puissance) ; expliciter les différences de qualité.
3. Finir le wrapper Capacitor Android, compiler un APK de test, installer et vérifier avant GitHub/Play Console.
4. Décider le pipeline de compilation iOS et documenter l'installation de l'IPA non signé (sans prétendre qu'il est prêt).
5. Terminer l'intégration FFmpeg et les vrais tests audio (parole, souffle, ambiance, saturation, formats). 
6. Garder le nom public exact **Chut !!!** (dépôt GitHub `chut` inchangé), logo B de Claude.
