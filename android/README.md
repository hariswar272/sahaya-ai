# Sahaya AI: Android app

Flutter WebView shell around https://sahaya.hmgenx.in (source: `app/`, entry `app/lib/main.dart`). Package id `in.hmgenx.aapadbandhu_ai` was kept, so it installs over earlier builds.

| File | Size | For |
|---|---|---|
| `Sahaya-AI-arm64.apk` | 14.9 MB | almost every phone from 2017 on; smallest, so share this one on WhatsApp |
| `Sahaya-AI.apk` | 42.2 MB | any Android 7+ phone (universal) |

`Aapadbandhu-AI*.apk` are identical copies at the old paths.

Install: copy the APK to the phone and open it (allow "install unknown apps"), or `adb install -r Sahaya-AI-arm64.apk`. Pick one variant and stick to it. The arm64 build has versionCode 2001 and the universal one has 1, so Android refuses to install the universal over the arm64.

What the shell adds over a browser tab:
- Always light: light theme, light status and nav bars with dark icons, night resources identical to day, forceDarkAllowed=false and isLightTheme=true. With targetSdk 36 that also keeps the WebView light (no algorithmic darkening, prefers-color-scheme: light).
- Animated splash: the logo scales and fades in, the title rises in, dots breathe while loading, and it all fades out into the site when the first page has loaded (at most 9 s).
- A thin blue→rose progress bar animates on every page load, and the offline screen fades and scales in and out.
- Microphone for the voice calls: asks Android for RECORD_AUDIO, then grants the page's getUserMedia request.
- Screenshot upload (Scam Shield) through the gallery picker.
- tel: links (112 / 1930 / 181), WhatsApp and other sites open in their own apps. sahaya.hmgenx.in and aapadbandhu.hmgenx.in stay inside the app.
- Back button goes back in page history. The offline screen has Retry and Call 112.

Rebuild: `cd app && flutter build apk --release` and `flutter build apk --release --split-per-abi` (Flutter 3.41, JAVA_HOME = Android Studio jbr). Signed with the debug key (demo build).
