const fs = require('fs');
const path = require('path');

const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');
const {
  addBuildSourceFileToGroup,
  addFramework,
  getProjectName,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj');

const STREAM_HOST = 'dhtk2.noip.pl';
const STREAM_USER_AGENT = 'El Radio app';
const ANDROID_RELEASE_ARCHITECTURES = 'armeabi-v7a,arm64-v8a';
const IOS_AUDIO_ROUTES_MODULE_FILENAME = 'ElRadioAudioRoutes.m';
const ANDROID_PACKAGE_PATH = path.join('pl', 'elradio', 'app');
const ANDROID_AUDIO_ROUTES_MODULE_FILENAME = 'ElRadioAudioRoutesModule.kt';
const ANDROID_AUDIO_ROUTES_PACKAGE_FILENAME = 'ElRadioAudioRoutesPackage.kt';

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Cannot patch El Radio native config. Missing anchor: ${label}`);
  }
  return source.replace(search, replacement);
}

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return properties;
  }
  properties.push({ type: 'property', key, value });
  return properties;
}

function writeFileIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

const IOS_AUDIO_ROUTES_MODULE_SOURCE = [
  '#import <AVKit/AVKit.h>',
  '#import <React/RCTBridgeModule.h>',
  '#import <React/RCTUtils.h>',
  '#import <UIKit/UIKit.h>',
  '',
  '@interface ElRadioAudioRoutesModule : NSObject <RCTBridgeModule>',
  '@end',
  '',
  '@implementation ElRadioAudioRoutesModule',
  '',
  'RCT_EXPORT_MODULE(ElRadioAudioRoutes)',
  '',
  '+ (BOOL)requiresMainQueueSetup',
  '{',
  '  return YES;',
  '}',
  '',
  'RCT_REMAP_METHOD(openAudioRoutePicker,',
  '                 openAudioRoutePickerWithResolver:(RCTPromiseResolveBlock)resolve',
  '                 rejecter:(RCTPromiseRejectBlock)reject)',
  '{',
  '  dispatch_async(dispatch_get_main_queue(), ^{',
  '    UIViewController *rootViewController = RCTPresentedViewController();',
  '    UIView *rootView = rootViewController.view;',
  '    if (!rootView) {',
  '      reject(' + '@' + String.fromCharCode(34) + 'audio_routes_unavailable' + String.fromCharCode(34) + ', ' + '@' + String.fromCharCode(34) + 'Root view is unavailable.' + String.fromCharCode(34) + ', nil);',
  '      return;',
  '    }',
  '',
  '    CGRect pickerFrame = CGRectMake(',
  '      CGRectGetMidX(rootView.bounds) - 22.0,',
  '      CGRectGetMidY(rootView.bounds) - 22.0,',
  '      44.0,',
  '      44.0',
  '    );',
  '    AVRoutePickerView *picker = [[AVRoutePickerView alloc] initWithFrame:pickerFrame];',
  '    picker.backgroundColor = UIColor.clearColor;',
  '    picker.tintColor = UIColor.clearColor;',
  '    picker.activeTintColor = UIColor.clearColor;',
  '    picker.alpha = 0.01;',
  '    if (@available(iOS 13.0, *)) {',
  '      picker.prioritizesVideoDevices = NO;',
  '    }',
  '',
  '    [rootView addSubview:picker];',
  '    [picker layoutIfNeeded];',
  '',
  '    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.08 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{',
  '      UIButton *routeButton = nil;',
  '      for (UIView *subview in picker.subviews) {',
  '        if ([subview isKindOfClass:[UIButton class]]) {',
  '          routeButton = (UIButton *)subview;',
  '          break;',
  '        }',
  '      }',
  '',
  '      if (routeButton) {',
  '        [routeButton sendActionsForControlEvents:UIControlEventTouchUpInside];',
  '        resolve(@YES);',
  '      } else {',
  '        reject(' + '@' + String.fromCharCode(34) + 'audio_routes_unavailable' + String.fromCharCode(34) + ', ' + '@' + String.fromCharCode(34) + 'AirPlay route button is unavailable.' + String.fromCharCode(34) + ', nil);',
  '      }',
  '',
  '      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{',
  '        [picker removeFromSuperview];',
  '      });',
  '    });',
  '  });',
  '}',
  '',
  '@end',
].join('\n');

const ANDROID_AUDIO_ROUTES_MODULE_SOURCE = [
  'package pl.elradio.app',
  '',
  'import android.content.Intent',
  'import android.provider.Settings',
  'import com.facebook.react.bridge.Promise',
  'import com.facebook.react.bridge.ReactApplicationContext',
  'import com.facebook.react.bridge.ReactContextBaseJavaModule',
  'import com.facebook.react.bridge.ReactMethod',
  '',
  'class ElRadioAudioRoutesModule(private val reactContext: ReactApplicationContext) :',
  '  ReactContextBaseJavaModule(reactContext) {',
  '',
  '  override fun getName(): String = "ElRadioAudioRoutes"',
  '',
  '  @ReactMethod',
  '  fun openAudioRoutePicker(promise: Promise) {',
  '    val activity = reactApplicationContext.currentActivity',
  '    val castIntent = Intent(Settings.ACTION_CAST_SETTINGS).apply {',
  '      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)',
  '    }',
  '',
  '    try {',
  '      if (activity != null) {',
  '        activity.startActivity(castIntent)',
  '      } else {',
  '        reactContext.startActivity(castIntent)',
  '      }',
  '      promise.resolve(true)',
  '    } catch (castError: Exception) {',
  '      val bluetoothIntent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {',
  '        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)',
  '      }',
  '      try {',
  '        if (activity != null) {',
  '          activity.startActivity(bluetoothIntent)',
  '        } else {',
  '          reactContext.startActivity(bluetoothIntent)',
  '        }',
  '        promise.resolve(true)',
  '      } catch (fallbackError: Exception) {',
  '        promise.reject("audio_routes_unavailable", "Audio route settings are unavailable.", fallbackError)',
  '      }',
  '    }',
  '  }',
  '}',
].join('\n');

const ANDROID_AUDIO_ROUTES_PACKAGE_SOURCE = [
  'package pl.elradio.app',
  '',
  'import com.facebook.react.ReactPackage',
  'import com.facebook.react.bridge.NativeModule',
  'import com.facebook.react.bridge.ReactApplicationContext',
  'import com.facebook.react.uimanager.ViewManager',
  '',
  'class ElRadioAudioRoutesPackage : ReactPackage {',
  '  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =',
  '    listOf(ElRadioAudioRoutesModule(reactContext))',
  '',
  '  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =',
  '    emptyList()',
  '}',
].join('\n');

function ensureAndroidAudioRoutesModule(projectRoot) {
  const sourceDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ANDROID_PACKAGE_PATH);
  writeFileIfChanged(
    path.join(sourceDir, ANDROID_AUDIO_ROUTES_MODULE_FILENAME),
    ANDROID_AUDIO_ROUTES_MODULE_SOURCE,
  );
  writeFileIfChanged(
    path.join(sourceDir, ANDROID_AUDIO_ROUTES_PACKAGE_FILENAME),
    ANDROID_AUDIO_ROUTES_PACKAGE_SOURCE,
  );

  const mainApplicationPath = path.join(sourceDir, 'MainApplication.kt');
  if (!fs.existsSync(mainApplicationPath)) {
    throw new Error(`Cannot patch Android audio routes. Missing file: ${mainApplicationPath}`);
  }

  let source = fs.readFileSync(mainApplicationPath, 'utf8');
  if (source.includes('ElRadioAudioRoutesPackage()')) {
    return;
  }

  source = replaceOnce(
    source,
    '              // add(MyReactNativePackage())',
    '              // add(MyReactNativePackage())\n              add(ElRadioAudioRoutesPackage())',
    'Android audio routes package',
  );
  fs.writeFileSync(mainApplicationPath, source);
}

function ensureIosAudioRoutesModule(projectRoot) {
  const projectName = getProjectName(projectRoot);
  const sourcePath = path.join(projectRoot, 'ios', projectName, IOS_AUDIO_ROUTES_MODULE_FILENAME);
  writeFileIfChanged(sourcePath, IOS_AUDIO_ROUTES_MODULE_SOURCE);
  return `${projectName}/${IOS_AUDIO_ROUTES_MODULE_FILENAME}`;
}

function patchExpoAvAndroidUserAgent(projectRoot) {
  const simpleExoPlayerDataPath = path.join(
    projectRoot,
    'node_modules',
    'expo-av',
    'android',
    'src',
    'main',
    'java',
    'expo',
    'modules',
    'av',
    'player',
    'SimpleExoPlayerData.java',
  );
  if (!fs.existsSync(simpleExoPlayerDataPath)) {
    throw new Error(`Cannot patch Expo AV Android user agent. Missing file: ${simpleExoPlayerDataPath}`);
  }

  let source = fs.readFileSync(simpleExoPlayerDataPath, 'utf8');
  if (source.includes(`"${STREAM_USER_AGENT}"`)) {
    return;
  }

  source = replaceOnce(
    source,
    '            Util.getUserAgent(context, "yourApplicationName"),',
    `            "${STREAM_USER_AGENT}",`,
    'Android ExoPlayer user agent',
  );

  fs.writeFileSync(simpleExoPlayerDataPath, source);
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
  config = withGradleProperties(config, (modConfig) => {
    modConfig.modResults = upsertGradleProperty(
      modConfig.modResults,
      'reactNativeArchitectures',
      ANDROID_RELEASE_ARCHITECTURES,
    );
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      patchExpoAvAndroidUserAgent(modConfig.modRequest.projectRoot);
      ensureAndroidAudioRoutesModule(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);

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
    const projectName = getProjectName(modConfig.modRequest.projectRoot);
    const audioRoutesFilePath = ensureIosAudioRoutesModule(modConfig.modRequest.projectRoot);
    if (!project.hasFile(audioRoutesFilePath)) {
      addBuildSourceFileToGroup({
        filepath: audioRoutesFilePath,
        groupName: projectName,
        project,
      });
    }
    if (!project.hasFile('MediaPlayer.framework')) {
      addFramework({
        project,
        projectName,
        framework: 'MediaPlayer.framework',
      });
    }
    if (!project.hasFile('AVKit.framework')) {
      addFramework({
        project,
        projectName,
        framework: 'AVKit.framework',
      });
    }
    return modConfig;
  });

  return config;
}

module.exports = withElRadioNativeConfig;
