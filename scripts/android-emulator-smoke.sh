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

# Gradle runs while the emulator is alive and can coincide with delayed
# system-service startup on constrained API 29 images. Re-check Package
# Manager immediately before installs, not only once before the build.
wait_for_package_manager() {
  local attempt package_list
  for attempt in $(seq 1 60); do
    package_list="$(adb shell cmd package list packages 2>/dev/null | tr -d '\r' || true)"
    if printf '%s\n' "$package_list" | grep -q '^package:' &&
       adb shell pm path android >/dev/null 2>&1; then
      echo "Package Manager is ready (attempt $attempt)."
      return 0
    fi
    echo "Waiting for Package Manager after emulator activity (attempt $attempt/60)..."
    sleep 3
  done
  echo "Package Manager is unavailable; collecting focused diagnostics."
  adb devices -l || true
  adb shell getprop sys.boot_completed || true
  adb shell service check package || true
  adb logcat -d -t 500 | grep -i -E 'PackageManager|system_server|FATAL EXCEPTION|am_crash' | tail -n 100 || true
  return 1
}

gradle --no-daemon -p android-native :app:assembleDebugAndroidTest
wait_for_package_manager

install_with_retry() {
  local apk="$1" attempt
  for attempt in $(seq 1 5); do
    if adb install -r "$apk"; then
      return 0
    fi
    echo "APK install attempt $attempt failed; waiting for Package Manager."
    wait_for_package_manager
    sleep 2
  done
  echo "APK installation failed after five attempts: $apk"
  return 1
}

install_with_retry android-native/app/build/outputs/apk/debug/app-debug.apk
install_with_retry android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w com.projectjerry.android.test/androidx.test.runner.AndroidJUnitRunner
adb shell am start -W -n com.projectjerry.android/.ui.MainActivity
sleep 5
adb shell pidof com.projectjerry.android
