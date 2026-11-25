Pod::Spec.new do |s|
  s.name = 'BycodaHostSocket'
  s.version = '1.0.0'
  s.summary = 'Credential-bound single-attempt Host WSS transport'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'bycoda'
  s.homepage = 'https://bycoda.com'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSecureStore', '58.0.3'
  s.dependency 'BycodaVoiceCompanion'
  s.source_files = '*.swift'
  s.test_spec 'Tests' do |test|
    test.source_files = 'Tests/**/*.swift'
    test.resources = '../fixtures/*.json'
  end
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
