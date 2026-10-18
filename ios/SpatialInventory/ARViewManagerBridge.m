#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ARViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(cardTitle, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardDescription, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardIcon, NSString)
RCT_EXPORT_VIEW_PROPERTY(placeTrigger, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(isPreviewActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onScreenTapped, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onCardPlaced, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(selectedModelUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(onModelPlaced, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(worldMapSaveRequest, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(relocalizeTarget, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onWorldMapStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRelocalizationStatus, RCTDirectEventBlock)
@end

