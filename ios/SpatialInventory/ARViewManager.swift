import Foundation
import React
import PhotosUI
import UIKit
import Vision
#if canImport(SensitiveContentAnalysis)
import SensitiveContentAnalysis
#endif

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

@objc(LocaAvatarPicker)
final class LocaAvatarPicker: NSObject, PHPickerViewControllerDelegate {
  private var pendingResolve: RCTPromiseResolveBlock?
  private var pendingReject: RCTPromiseRejectBlock?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc(pickAvatarImage:rejecter:)
  func pickAvatarImage(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if let prevReject = self.pendingReject {
        prevReject("CANCELLED", "新しい画像選択が開始されました", nil)
      }
      self.pendingResolve = resolve
      self.pendingReject = reject

      var config = PHPickerConfiguration(photoLibrary: .shared())
      config.selectionLimit = 1
      config.filter = .images

      let picker = PHPickerViewController(configuration: config)
      picker.delegate = self

      guard let presenter = Self.topViewController() else {
        self.finishWithError("NO_VIEW_CONTROLLER", message: "画面を表示できませんでした")
        return
      }
      presenter.present(picker, animated: true)
    }
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)

    guard let provider = results.first?.itemProvider,
          provider.canLoadObject(ofClass: UIImage.self) else {
      finishWithResult(nil)
      return
    }

    provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
      guard let self else { return }
      if let error {
        self.finishWithError("LOAD_ERROR", message: error.localizedDescription)
        return
      }
      guard let rawImage = object as? UIImage else {
        self.finishWithResult(nil)
        return
      }

      // オンデバイスで不適切な画像（性的・暴力的表現など）を検査
      self.validateImageSafety(rawImage) { isSafe, reason in
        if !isSafe {
          self.finishWithError("INAPPROPRIATE_IMAGE", message: reason ?? "不適切な画像の可能性があるため、設定できませんでした。")
          return
        }

        // 正方形(256x256)にリサイズして軽量JPEG Data URIへ変換
        guard let resized = Self.centerSquareResize(rawImage, size: 256),
              let jpegData = resized.jpegData(compressionQuality: 0.78) else {
          self.finishWithError("ENCODE_ERROR", message: "画像の処理に失敗しました")
          return
        }

        let base64 = jpegData.base64EncodedString()
        self.finishWithResult("data:image/jpeg;base64,\(base64)")
      }
    }
  }

  private func validateImageSafety(_ image: UIImage, completion: @escaping (Bool, String?) -> Void) {
    guard let cgImage = image.cgImage else {
      completion(true, nil)
      return
    }

    // 1. iOS 17+ SensitiveContentAnalysis (対応端末・設定時)
    #if canImport(SensitiveContentAnalysis)
    if #available(iOS 17.0, *) {
      let analyzer = SCSensitivityAnalyzer()
      if analyzer.analysisPolicy != .disabled {
        Task {
          do {
            let result = try await analyzer.analyzeImage(cgImage)
            if result.isSensitive {
              completion(false, "センシティブなコンテンツが検出されたため、アイコンに設定できません。")
              return
            }
            self.runVisionClassificationCheck(cgImage, completion: completion)
          } catch {
            self.runVisionClassificationCheck(cgImage, completion: completion)
          }
        }
        return
      }
    }
    #endif

    runVisionClassificationCheck(cgImage, completion: completion)
  }

  private func runVisionClassificationCheck(_ cgImage: CGImage, completion: @escaping (Bool, String?) -> Void) {
    let blockedKeywords = [
      "weapon", "firearm", "gun", "rifle", "knife", "sword",
      "blood", "nudity", "lingerie", "underwear", "bikini",
      "cigarette", "tobacco", "drug", "alcohol", "beer_bottle"
    ]

    let request = VNClassifyImageRequest { request, _ in
      guard let observations = request.results as? [VNClassificationObservation] else {
        completion(true, nil)
        return
      }
      for obs in observations where obs.confidence >= 0.45 {
        let id = obs.identifier.lowercased()
        if blockedKeywords.contains(where: { id.contains($0) }) {
          completion(false, "ガイドラインに反する可能性がある画像（\(obs.identifier)）のため設定できません。")
          return
        }
      }
      completion(true, nil)
    }

    DispatchQueue.global(qos: .userInitiated).async {
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        completion(true, nil)
      }
    }
  }

  private func finishWithResult(_ value: String?) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.pendingResolve?(value)
      self.pendingResolve = nil
      self.pendingReject = nil
    }
  }

  private func finishWithError(_ code: String, message: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.pendingReject?(code, message, nil)
      self.pendingResolve = nil
      self.pendingReject = nil
    }
  }

  private static func centerSquareResize(_ image: UIImage, size: CGFloat) -> UIImage? {
    let targetSize = CGSize(width: size, height: size)
    let renderer = UIGraphicsImageRenderer(size: targetSize)
    return renderer.image { _ in
      let w = image.size.width
      let h = image.size.height
      let side = min(w, h)
      let scale = size / max(side, 1)
      let drawW = w * scale
      let drawH = h * scale
      let origin = CGPoint(x: (size - drawW) / 2, y: (size - drawH) / 2)
      image.draw(in: CGRect(origin: origin, size: CGSize(width: drawW, height: drawH)))
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let root = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController
    var current = root
    while let presented = current?.presentedViewController {
      current = presented
    }
    return current
  }
}
