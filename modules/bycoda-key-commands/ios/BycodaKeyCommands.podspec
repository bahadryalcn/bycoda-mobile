Pod::Spec.new do |s|
  s.name = 'BycodaKeyCommands'
  s.version = '1.0.0'
  s.summary = 'Hardware keyboard commands for bycoda'
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
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
