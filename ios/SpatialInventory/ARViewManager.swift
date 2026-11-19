import Foundation
import React
import UIKit

@objc(ARViewManager)
final class ARViewManager: RCTViewManager {
  override static func moduleName() -> String! {
    return "ARView"
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func view() -> UIView! {
    return ARViewWrapper()
  }
}
