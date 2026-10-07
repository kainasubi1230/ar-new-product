#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ARViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(cardTitle, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardDescription, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(cardIcon, NSString)
RCT_EXPORT_VIEW_PROPERTY(onCardPlaced, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(selectedModelUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(onModelPlaced, RCTDirectEventBlock)
@end

