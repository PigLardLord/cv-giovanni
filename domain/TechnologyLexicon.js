/**
 * Technologies by name, as data (#292).
 *
 * The provenance check reads a name from its capitals, which a tailoring can drop: "… by moving to graphql." and a
 * sentence that opens on "Fastlane" passed, and in a German translation, whose nouns are all capitalised, "Flutter"
 * read as any other noun. A technology listed here is held to the source however it is written, in either language.
 *
 * Only words that name nothing else: "Swift", "React", "Combine", "Room", "Realm", "Go" and "Rust" are ordinary words
 * too, and holding them would refuse "reacted swiftly to combine the two flows". Those stay with the capitals, where a
 * name is read as a name. Like every lexicon here, a floor, not a guarantee: a technology it does not list is still
 * read only from how it is written.
 */
export const TECHNOLOGIES = Object.freeze([
  // Languages and runtimes
  'Kotlin',
  'Objective-C',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Python',
  'Scala',
  'Elixir',
  // Apple and Android
  'SwiftUI',
  'UIKit',
  'AppKit',
  'Xcode',
  'XCTest',
  'XCUITest',
  'CoreML',
  'TestFlight',
  'CocoaPods',
  'Alamofire',
  'RxSwift',
  'RxJava',
  'Jetpack Compose',
  'Gradle',
  'React Native',
  'Xamarin',
  // Delivery
  'fastlane',
  'Bitrise',
  'Jenkins',
  'CircleCI',
  'GitHub Actions',
  'GitLab CI',
  'Docker',
  'Kubernetes',
  'Terraform',
  // Services and data
  'Firebase',
  'Crashlytics',
  'Sentry',
  'Datadog',
  'New Relic',
  'GraphQL',
  'gRPC',
  'Protobuf',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Kafka',
  'Elasticsearch',
  'TensorFlow',
  'PyTorch'
]);

/**
 * Technologies whose names are English words too: "UI flutter during fast scrolling" is a wobble, not the framework (the
 * review of #360). In English the capital tells them apart, and the name reading has it; in a translation, whose nouns
 * are all capitalised, it does not, and German has no noun "Flutter". So these are held to the source in a translation
 * only. "Espresso" is left out altogether: a coffee in every language here.
 */
export const ALSO_ENGLISH_WORDS = Object.freeze(['Flutter']);
