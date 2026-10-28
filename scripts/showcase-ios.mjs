/** Xcode's XCTest is the foreground authority; simctl alone is insufficient. Never launches the target app. */
import fs from "node:fs";
import path from "node:path";

export function writeForegroundProbe(directory, bundleId, nonce) {
  if (
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(bundleId) ||
    !/^[a-f0-9]{24}$/.test(nonce)
  )
    throw new Error("Invalid probe identity");
  const project = path.join(directory, "ShowcaseProbe.xcodeproj");
  fs.mkdirSync(path.join(project, "xcshareddata/xcschemes"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "ForegroundTests.swift"),
    `import XCTest
final class ForegroundTests: XCTestCase {
  func testAlreadyForeground() throws {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "${bundleId}")
    XCTAssertEqual(app.state, .runningForeground, "The explicit target must already be in the foreground; the probe never launches it")
    let png = app.screenshot().pngRepresentation
    XCTAssertEqual(app.state, .runningForeground)
    let target = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!.appendingPathComponent("showcase-${nonce}.png")
    try png.write(to: target, options: .atomic)
  }
}
`,
  );
  const ids = Object.fromEntries(
    [
      "project",
      "group",
      "target",
      "product",
      "source",
      "buildFile",
      "sources",
      "frameworks",
      "resources",
      "projectConfigs",
      "projectDebug",
      "targetConfigs",
      "targetDebug",
    ].map((key, index) => [key, (index + 1).toString(16).padStart(24, "0").toUpperCase()]),
  );
  const i = ids;
  fs.writeFileSync(
    path.join(project, "project.pbxproj"),
    `// !$*UTF8*$!
{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {
${i.project} = { isa = PBXProject; buildConfigurationList = ${i.projectConfigs}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = ${i.group}; projectDirPath = ""; projectRoot = ""; targets = (${i.target}); };
${i.group} = { isa = PBXGroup; children = (${i.source}, ${i.product}); sourceTree = "<group>"; };
${i.source} = { isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ForegroundTests.swift; sourceTree = "<group>"; };
${i.product} = { isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ShowcaseProbe.xctest; sourceTree = BUILT_PRODUCTS_DIR; };
${i.buildFile} = { isa = PBXBuildFile; fileRef = ${i.source}; };
${i.target} = { isa = PBXNativeTarget; buildConfigurationList = ${i.targetConfigs}; buildPhases = (${i.sources}, ${i.frameworks}, ${i.resources}); buildRules = (); dependencies = (); name = ShowcaseProbe; productName = ShowcaseProbe; productReference = ${i.product}; productType = "com.apple.product-type.bundle.ui-testing"; };
${i.sources} = { isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${i.buildFile}); runOnlyForDeploymentPostprocessing = 0; };
${i.frameworks} = { isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
${i.resources} = { isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
${i.projectConfigs} = { isa = XCConfigurationList; buildConfigurations = (${i.projectDebug}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug; };
${i.targetConfigs} = { isa = XCConfigurationList; buildConfigurations = (${i.targetDebug}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug; };
${i.projectDebug} = { isa = XCBuildConfiguration; name = Debug; buildSettings = { SDKROOT = iphonesimulator; IPHONEOS_DEPLOYMENT_TARGET = 16.0; }; };
${i.targetDebug} = { isa = XCBuildConfiguration; name = Debug; buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = com.bycoda.showcaseprobe; PRODUCT_NAME = "$(TARGET_NAME)"; GENERATE_INFOPLIST_FILE = YES; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; SDKROOT = iphonesimulator; SUPPORTED_PLATFORMS = iphonesimulator; CODE_SIGNING_ALLOWED = NO; }; };
}; rootObject = ${i.project}; }
`,
  );
  fs.writeFileSync(
    path.join(project, "xcshareddata/xcschemes/ShowcaseProbe.xcscheme"),
    `<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="1600" version="1.7"><BuildAction parallelizeBuildables="NO" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${i.target}" BuildableName="ShowcaseProbe.xctest" BlueprintName="ShowcaseProbe" ReferencedContainer="container:ShowcaseProbe.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${i.target}" BuildableName="ShowcaseProbe.xctest" BlueprintName="ShowcaseProbe" ReferencedContainer="container:ShowcaseProbe.xcodeproj"/></TestableReference></Testables></TestAction></Scheme>`,
  );
  return project;
}
