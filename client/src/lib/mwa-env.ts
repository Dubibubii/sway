const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

const isWebView = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  
  // Various WebView indicators
  const hasWebViewIndicator = /wv\)/.test(ua) || /; wv/.test(ua);
  
  // Check for Android Chrome (not WebView)
  const isAndroidChrome = /Chrome/.test(ua) && /Android/.test(ua) && !/wv\)/.test(ua);
  
  // Additional checks for wrapped apps that might not include 'wv'
  const hasWebViewVersion = /Version\/\d/.test(ua) && /Android/.test(ua);
  const lacksChrome = !/Chrome/.test(ua) && /Android/.test(ua);
  
  // Check for TWA (Trusted Web Activity) - these work like Chrome
  const isTWA = 'getInstalledRelatedApps' in navigator;
  
  // If it's a TWA, it's NOT a WebView (TWAs run in Chrome context)
  if (isTWA) return false;
  
  return isAndroid && (hasWebViewIndicator || hasWebViewVersion || lacksChrome || !isAndroidChrome);
})();

const isSeekerDevice = typeof navigator !== 'undefined' && /Seeker|SMS1/i.test(navigator.userAgent);

export const MWA_ENV = {
  isAndroid,
  isWebView,
  isSeekerDevice,
  isSupported: isAndroid && !isWebView,
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
};
