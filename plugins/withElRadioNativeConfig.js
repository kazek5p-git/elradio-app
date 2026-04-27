const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const STREAM_HOST = 'dhtk2.noip.pl';

function withElRadioNativeConfig(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return modConfig;
  });

  config = withInfoPlist(config, (modConfig) => {
    const plist = modConfig.modResults;
    plist.NSAppTransportSecurity = plist.NSAppTransportSecurity || {};
    plist.NSAppTransportSecurity.NSExceptionDomains =
      plist.NSAppTransportSecurity.NSExceptionDomains || {};
    plist.NSAppTransportSecurity.NSExceptionDomains[STREAM_HOST] = {
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    };
    plist.UIBackgroundModes = Array.from(new Set([...(plist.UIBackgroundModes || []), 'audio']));
    return modConfig;
  });

  return config;
}

module.exports = withElRadioNativeConfig;
