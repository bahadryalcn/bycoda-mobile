Pod::Spec.new do |s|
  s.name = 'BycodaVoiceCompanion'
  s.version = '1.0.0'
  s.summary = 'Session-fenced voice call audio that keeps an assistant call alive in the background'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'bycoda'
  s.homepage = 'https://bycoda.com'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'AVFoundation'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
