/** Owner authentication must be recent before the first trusted device can be established. */
export function hasRecentOwnerAuthentication(
  authTime: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 300,
): boolean {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0 ||
      !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 ||
      !Number.isSafeInteger(authTime) || typeof authTime !== 'number') {
    return false;
  }
  return authTime >= 0 && authTime <= nowSeconds + 30 &&
    nowSeconds - authTime <= maxAgeSeconds;
}
