#!/usr/bin/env bash
set -euo pipefail

adb wait-for-device
for attempt in $(seq 1 60); do
  boot_completed="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$boot_completed" == "1" ]]; then
    break
  fi
  sleep 2
done

test "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1"
test "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" = "29"

# Probe the actual Package Manager operation rather than service check,
# which is unreliable on some API 29 Google APIs emulator images.
package_manager_ready=false
for attempt in $(seq 1 90); do
  package_list="$(adb shell cmd package list packages 2>/dev/null | tr -d '\r' || true)"
  if printf '%s\n' "$package_list" | grep -q '^package:'; then
    package_manager_ready=true
    echo "Package Manager is responding (attempt $attempt)."
    break
  fi
  echo "Waiting for Package Manager (attempt $attempt/90)..."
  sleep 4
done

if [[ "$package_manager_ready" != "true" ]]; then
  echo "Package Manager did not become ready. Emulator diagnostics:"
  adb devices -l || true
  adb shell getprop sys.boot_completed || true
  adb shell getprop init.svc.bootanim || true
  adb shell service list || true
  adb logcat -d -t 1200 || true
  exit 1
fi

adb shell pm path android >/dev/null
gradle --no-daemon -p android-native :app:assembleDebugAndroidTest
adb install -r android-native/app/build/outputs/apk/debug/app-debug.apk
adb install -r android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w com.projectjerry.android.test/androidx.test.runner.AndroidJUnitRunner
adb shell am start -W -n com.projectjerry.android/.ui.MainActivity
sleep 5
adb shell pidof com.projectjerry.android
