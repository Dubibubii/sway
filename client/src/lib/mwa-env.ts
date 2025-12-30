// MWA Environment Detection for Solana Mobile
// This module detects the runtime environment to determine MWA support

const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// Detect Android - check for "Android" in UA
const isAndroid = /Android/i.test(userAgent);

// Detect Solana Seeker device
// Seeker browser UA may contain: "Solana Seeker", "Seeker", "SMS1", or "SolanaMobile"
// Use case-insensitive matching and handle variations with/without spaces
const isSeekerDevice = /Solana\s*Seeker|Seeker|SMS1|SolanaMobile/i.test(userAgent);

// Detect WebView vs real browser
// WebViews have specific markers like "wv)" or "; wv" in the UA
// Seeker's native browser is NOT a WebView - it's a full Chrome-based browser
const isWebView = (() => {
  if (typeof navigator === 'undefined') return false;
  
  // Seeker device browser is always supported - it's not a WebView
  if (isSeekerDevice) return false;
  
  // Explicit WebView markers
  const hasWebViewIndicator = /wv\)/.test(userAgent) || /; wv/.test(userAgent);
  
  // If explicit WebView marker is present, it's definitely a WebView
  if (hasWebViewIndicator) return true;
  
  // Check for Android Chrome (not WebView) - Chrome without "wv" marker
  const isAndroidChrome = /Chrome/.test(userAgent) && /Android/.test(userAgent);
  
  // Android Chrome without WebView markers = real browser
  if (isAndroidChrome) return false;
  
  // Some WebViews use "Version/X.X" format without Chrome - basic Android WebView
  const hasWebViewVersion = /Version\/\d/.test(userAgent) && /Android/.test(userAgent) && !/Chrome/.test(userAgent);
  
  // If there's no Chrome in the UA on Android, it's likely a basic WebView
  const lacksChrome = !/Chrome/.test(userAgent) && /Android/.test(userAgent);
  
  // Check for TWA (Trusted Web Activity) - these work like Chrome and support MWA
  const isTWA = 'getInstalledRelatedApps' in navigator;
  if (isTWA) return false;
  
  return isAndroid && (hasWebViewVersion || lacksChrome);
})();

// MWA is supported on:
// 1. Seeker devices (always)
// 2. Android Chrome browser (not WebView)
// 3. Any Android browser that's not a WebView
const isSupported = isSeekerDevice || (isAndroid && !isWebView);

// For debugging - log all detection values on client side
if (typeof window !== 'undefined') {
  console.log('[MWA-ENV] Detection results:', {
    userAgent: userAgent.substring(0, 100) + (userAgent.length > 100 ? '...' : ''),
    isAndroid,
    isSeekerDevice,
    isWebView,
    isSupported,
    hasChrome: /Chrome/.test(userAgent),
    hasWebViewMarker: /wv\)/.test(userAgent) || /; wv/.test(userAgent),
    hasTWA: typeof navigator !== 'undefined' && 'getInstalledRelatedApps' in navigator,
  });
}

export const MWA_ENV = {
  isAndroid,
  isWebView,
  isSeekerDevice,
  isSupported,
  userAgent,
};
