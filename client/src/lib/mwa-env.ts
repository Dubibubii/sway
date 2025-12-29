const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const isWebView = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const hasWebViewIndicator = /wv\)/.test(ua) || /; wv/.test(ua);
  const isAndroidChrome = /Chrome/.test(ua) && /Android/.test(ua) && !/wv\)/.test(ua);
  return isAndroid && (hasWebViewIndicator || (!isAndroidChrome && !/Chrome/.test(ua)));
})();
const isSeekerDevice = typeof navigator !== 'undefined' && /Seeker|SMS1/i.test(navigator.userAgent);

export const MWA_ENV = {
  isAndroid,
  isWebView,
  isSeekerDevice,
  isSupported: isAndroid && !isWebView,
};
