#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ARViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(cardTitle, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardDescription, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardIcon, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardTags, NSArray)
RCT_EXPORT_VIEW_PROPERTY(placeTrigger, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(isPreviewActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onScreenTapped, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPresenceTapped, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(supabaseAccessToken, NSString)
RCT_EXPORT_VIEW_PROPERTY(notice, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onCardTapped, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onCardPlaced, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(selectedModelUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(onModelPlaced, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(worldMapSaveRequest, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(relocalizeTarget, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(geoTags, NSArray)
RCT_EXPORT_VIEW_PROPERTY(onWorldMapStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRelocalizationStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLocationAccuracyStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onCompassStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(debugEnabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onDebugInfo, RCTDirectEventBlock)
@end


#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(LocaHeading, RCTEventEmitter)
@end

@interface RCT_EXTERN_MODULE(LocaPocket, RCTEventEmitter)
RCT_EXTERN_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(start:(NSArray *)targets options:(NSDictionary *)options)
RCT_EXTERN_METHOD(updateTargets:(NSArray *)targets)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(getHistory:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearHistory)
@end

@interface RCT_EXTERN_MODULE(LocaGeocoder, NSObject)
RCT_EXTERN_METHOD(reverseGeocode:(double)latitude longitude:(double)longitude resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
