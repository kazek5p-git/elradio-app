const fs = require('fs');
const path = require('path');

const { withAndroidManifest, withDangerousMod, withInfoPlist, withXcodeProject } = require('@expo/config-plugins');
const { addFramework, getProjectName } = require('@expo/config-plugins/build/ios/utils/Xcodeproj');

const STREAM_HOST = 'dhtk2.noip.pl';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Cannot patch Expo AV now playing metadata. Missing anchor: ${label}`);
  }
  return source.replace(search, replacement);
}

function patchExpoAvNowPlaying(projectRoot) {
  const playerDataPath = path.join(projectRoot, 'node_modules', 'expo-av', 'ios', 'EXAV', 'EXAVPlayerData.m');
  if (!fs.existsSync(playerDataPath)) {
    throw new Error(`Cannot patch Expo AV now playing metadata. Missing file: ${playerDataPath}`);
  }

  let source = fs.readFileSync(playerDataPath, 'utf8');
  if (source.includes('EXElRadioUpdateNowPlayingInfo')) {
    return;
  }

  source = replaceOnce(
    source,
    '#import <MobileCoreServices/MobileCoreServices.h>',
    '#import <MobileCoreServices/MobileCoreServices.h>\n#import <MediaPlayer/MediaPlayer.h>',
    'MediaPlayer import',
  );

  source = replaceOnce(
    source,
    'NSString *const EXAVPlayerDataObserverMetadataKeyPath = @"timedMetadata";',
    `NSString *const EXAVPlayerDataObserverMetadataKeyPath = @"timedMetadata";

static NSString *const EXElRadioStreamUserAgent = @"El Radio app";
static NSString *const EXElRadioNowPlayingTitle = @"Odtwarzanie El Radio";
static NSString *const EXElRadioNowPlayingArtist = @"El Radio";
static NSString *const EXElRadioNowPlayingAlbum = @"El Radio app";

static BOOL EXElRadioIsStream(NSURL *url, NSDictionary *headers)
{
  NSString *absoluteUrl = url.absoluteString ?: @"";
  NSString *userAgent = headers[@"User-Agent"] ?: headers[@"user-agent"] ?: headers[@"USER-AGENT"];
  return [absoluteUrl containsString:@"dhtk2.noip.pl:8888/elradio"] ||
    [absoluteUrl containsString:@"kazpar.pl:8888/elradio"] ||
    [userAgent isEqualToString:EXElRadioStreamUserAgent];
}

static AVMutableMetadataItem *EXElRadioMetadataItem(NSString *identifier, NSString *value)
{
  AVMutableMetadataItem *item = [AVMutableMetadataItem metadataItem];
  item.identifier = identifier;
  item.value = value;
  item.extendedLanguageTag = @"pl";
  return item;
}

static void EXElRadioApplyExternalMetadata(AVPlayerItem *item, NSURL *url, NSDictionary *headers)
{
  if (!item || !EXElRadioIsStream(url, headers)) {
    return;
  }

  item.externalMetadata = @[
    EXElRadioMetadataItem(AVMetadataCommonIdentifierTitle, EXElRadioNowPlayingTitle),
    EXElRadioMetadataItem(AVMetadataCommonIdentifierArtist, EXElRadioNowPlayingArtist),
    EXElRadioMetadataItem(AVMetadataCommonIdentifierAlbumName, EXElRadioNowPlayingAlbum),
  ];
}

static void EXElRadioUpdateNowPlayingInfo(NSURL *url, NSDictionary *headers, BOOL isPlaying)
{
  if (!EXElRadioIsStream(url, headers)) {
    return;
  }

  [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = @{
    MPMediaItemPropertyTitle: EXElRadioNowPlayingTitle,
    MPMediaItemPropertyArtist: EXElRadioNowPlayingArtist,
    MPMediaItemPropertyAlbumTitle: EXElRadioNowPlayingAlbum,
    MPNowPlayingInfoPropertyIsLiveStream: @YES,
    MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? @(1.0) : @(0.0),
  };
}`,
    'now playing helper',
  );

  source = replaceOnce(
    source,
    `    AVPlayerItem *firstplayerItem = [AVPlayerItem playerItemWithAsset:avAsset];
    AVPlayerItem *secondPlayerItem = [AVPlayerItem playerItemWithAsset:avAsset];
    AVPlayerItem *thirdPlayerItem = [AVPlayerItem playerItemWithAsset:avAsset];`,
    `    AVPlayerItem *firstplayerItem = [AVPlayerItem playerItemWithAsset:avAsset];
    AVPlayerItem *secondPlayerItem = [AVPlayerItem playerItemWithAsset:avAsset];
    AVPlayerItem *thirdPlayerItem = [AVPlayerItem playerItemWithAsset:avAsset];
    EXElRadioApplyExternalMetadata(firstplayerItem, self.url, self.headers);
    EXElRadioApplyExternalMetadata(secondPlayerItem, self.url, self.headers);
    EXElRadioApplyExternalMetadata(thirdPlayerItem, self.url, self.headers);`,
    'player item metadata',
  );

  source = replaceOnce(
    source,
    `        [self _tryPlayPlayerWithRateAndMuteIfNecessary];

        self.isLoaded = YES;`,
    `        [self _tryPlayPlayerWithRateAndMuteIfNecessary];
        EXElRadioUpdateNowPlayingInfo(self.url, self.headers, [self _shouldPlayerPlay]);

        self.isLoaded = YES;`,
    'load now playing update',
  );

  source = replaceOnce(
    source,
    `      if (!resolve || !reject) {
        [self _callStatusUpdateCallback];
      }

      [self.exAV demoteAudioSessionIfPossible];`,
    `      EXElRadioUpdateNowPlayingInfo(self.url, self.headers, [self _isPlayerPlaying] || [self _shouldPlayerPlay]);

      if (!resolve || !reject) {
        [self _callStatusUpdateCallback];
      }

      [self.exAV demoteAudioSessionIfPossible];`,
    'status now playing update',
  );

  source = replaceOnce(
    source,
    `  if (_player) {
    [_player pause];
  }`,
    `  if (_player) {
    [_player pause];
    EXElRadioUpdateNowPlayingInfo(_url, _headers, NO);
  }`,
    'pause now playing update',
  );

  fs.writeFileSync(playerDataPath, source);
}

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

  config = withDangerousMod(config, [
    'ios',
    (modConfig) => {
      patchExpoAvNowPlaying(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    if (!project.hasFile('MediaPlayer.framework')) {
      addFramework({
        project,
        projectName: getProjectName(modConfig.modRequest.projectRoot),
        framework: 'MediaPlayer.framework',
      });
    }
    return modConfig;
  });

  return config;
}

module.exports = withElRadioNativeConfig;
