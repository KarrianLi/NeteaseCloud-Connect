#!/usr/bin/env bash
# 手工打包 APK（不依赖 Gradle）：aapt2 + javac + d8 + zipalign + apksigner
# 仅限 Windows + Git Bash；依赖：JDK 17+、Android SDK（platform android-34、build-tools 35.0.0）
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

SDK="${ANDROID_SDK:-${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}}"
BT="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
[ -f "$PLATFORM" ] || PLATFORM="$SDK/platforms/android-35/android.jar"
if [ ! -f "$PLATFORM" ]; then echo "找不到 android.jar，请设置 ANDROID_SDK 指向 Android SDK 目录"; exit 1; fi
if [ ! -d "$BT" ]; then echo "找不到 build-tools 35.0.0，请用 sdkmanager 安装：sdkmanager 'build-tools;35.0.0'"; exit 1; fi

# JDK
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
else
  JDK_BIN="$(ls -d "/c/Program Files/Java"/jdk-*/bin 2>/dev/null | head -1)"
  if [ -n "$JDK_BIN" ]; then export JAVA_HOME="$(dirname "$JDK_BIN")"; export PATH="$JAVA_HOME/bin:$PATH"; fi
fi
command -v javac >/dev/null || { echo "找不到 javac，请安装 JDK 17+ 并设置 JAVA_HOME"; exit 1; }

# d8.bat 需要 Windows 路径
if command -v cygpath >/dev/null 2>&1; then PLATFORM_WIN="$(cygpath -w "$PLATFORM")"; else PLATFORM_WIN="$PLATFORM"; fi

OUT="$ROOT/build"
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/dex"

"$BT/aapt2" compile --dir "$ROOT/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" \
  --manifest "$ROOT/AndroidManifest.xml" \
  --min-sdk-version 21 --target-sdk-version 34 "$OUT/res.zip"

javac -encoding UTF-8 --release 8 -classpath "$PLATFORM" -d "$OUT/classes" \
  $(find "$ROOT/src" -name '*.java')

"$BT/d8.bat" --lib "$PLATFORM_WIN" --min-api 21 --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class')

cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && jar uf "$OUT/unsigned.apk" classes.dex)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$ROOT/keystore.jks" ]; then
  keytool -genkeypair -keystore "$ROOT/keystore.jks" -alias musicremote \
    -storepass musicremote -keypass musicremote \
    -dname "CN=MusicRemote, O=Personal, C=CN" \
    -keyalg RSA -keysize 2048 -validity 10000 -noprompt
fi

"$BT/apksigner.bat" sign --ks "$ROOT/keystore.jks" \
  --ks-pass pass:musicremote --key-pass pass:musicremote \
  --out "$ROOT/musicremote.apk" "$OUT/aligned.apk"

"$BT/apksigner.bat" verify --print-certs "$ROOT/musicremote.apk" | head -6
ls -la "$ROOT/musicremote.apk"
