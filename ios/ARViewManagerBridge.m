#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(ARViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(selectedModelUrl, NSString)
RCT_EXPORT_VIEW_PROPERTY(onModelPlaced, RCTDirectEventBlock)
@end
