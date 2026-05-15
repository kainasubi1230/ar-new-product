import Foundation
import React

@objc(ARViewManager)
final class ARViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func view() -> UIView! {
    return ARViewWrapper()
  }
}
