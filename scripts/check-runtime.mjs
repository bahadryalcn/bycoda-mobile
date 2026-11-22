import { readdir, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
const desktopSource = path.resolve(mobileRoot, "../src");
// These contracts are deliberately free of desktop UI, browser storage and Tauri.
const pureContracts = new Set([
  // Dependency-free brand metadata shared by native Help and desktop About.
  "shared/lib/productIdentity",
  // Pure typed-array PCM/VAD math and base64 codecs; no DOM, audio device or desktop imports.
  "features/voice/model/voiceVad",
  "features/voice/model/dictationModels",
  "shared/lib/text/truncate",
  // Dependency-free Intl formatter caches; widget timestamps use the selected mobile locale.
  "shared/lib/intl",
  "shared/lib/withTimeout",
  "shared/lib/time/hostLifetime",
  "shared/lib/time/timestamps",
  "shared/model/host-contracts",
  // Pool flattening is a pure function over the routing contract.
  "shared/model/modelRoutingPools",
  // Assistant wire validation is pure; mobile still uses the paired transport and owner gates.
  "shared/model/host-contracts/assistant",
  "shared/model/host-contracts/automations",
  "shared/model/host-contracts/git",
  // Delegation and image-model keys are pure wire contracts (zod and each other only).
  "shared/model/host-contracts/delegation",
  "shared/model/host-contracts/image-models",
  // Findings eligibility uses primitives only; authority remains on the Host.
  "shared/model/host-contracts/task-findings",
  "shared/model/host-contracts/schemas",
  "shared/model/host-contracts/tasks",
  // Work caps share the canonical pure model routing schema; no desktop UI runtime.
  "shared/model/host-contracts/model-routing",
  // Two constants shared with the desktop and Host: the response byte cap and its error code.
  "shared/model/host-contracts/response-limit",
  "shared/model/approvalOccurrence",
  "shared/model/productProviderDefaults",
  // Portable session execution policy has no desktop runtime dependencies.
  "shared/lib/host-runtime/session-execution",
  // User-turn display text and delegation notice parsing are pure string helpers.
  "features/sessions/model/userPromptText",
  "features/sessions/model/delegationNotice",
  "features/sessions/model/claudeAdvisor",
  "features/sessions/model/claudeCompact",
  "features/sessions/model/claudeSubagents",
  "shared/i18n/languages",
  "integrations/mobile-pairing",
  "integrations/mobile-lan",
  "integrations/account-pair-crypto",
  "features/connections/model/protocol",
  "features/connections/model/sharedQueue",
  "features/sessions/model/queuePersistence",
  "features/inbox/model/remoteInbox",
  "features/tasks/model/taskRules",
  "features/tasks/model/taskBulkActions",
  "features/crews/model/crew",
  // Crew identity: pure traits, link state and pixel-art rects (no DOM); mobile draws them with react-native-svg.
  "features/crews/model/crewIdentity",
  "features/crews/model/crewLink",
  "features/crews/model/memberAvatars",
  "features/crews/model/memberAvatarTraits",
  "features/crews/model/memberAvatarArt",
  "features/sessions/model/conversationRewind",
  "features/skills/model/cliCommandCatalog",
  "features/source-control/model/selectiveStage",
  "features/notes/noteContext",
  "shared/lib/browserAnnotation",
  "integrations/mobile-pairing",
  // Same-name project hints are pure string helpers shared with the desktop rail.
  "features/projects/ui/projectIdentity",
  // Session list status rank and unseen-finished tracking are pure set logic (type-only imports).
  "features/sessions/model/sessionStatusOrder",
  "features/sessions/model/sessionDone",
  // Transcript turn chrome: interruption notices, retry and usage-limit parsing are pure string helpers.
  "features/sessions/model/turnInterruption",
  "features/sessions/model/sessionIssue",
  "features/sessions/model/sessionErrorPresentation",
]);
const errors = [];
const contractRoots = new Set();
// Desktop modules that assume the desktop window (Tauri, browser locale) and crash the native app at load.
const desktopOnlyModules = new Set(["shared/i18n/core", "shared/i18n/index"]);
const resolveSource = (base) =>
  [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
/** Pure contracts must stay pure through every runtime import, not only the first hop. */
async function inspectContractClosure() {
  const parents = new Map();
  const queue = [...contractRoots]
    .map((root) => resolveSource(root))
    .filter(Boolean)
    .map((root) => (parents.set(root, undefined), root));
  while (queue.length) {
    const file = queue.shift();
    const relative = path.relative(desktopSource, file).replaceAll("\\", "/").replace(/\.tsx?$/, "");
    const source = await readFile(file, "utf8");
    const specifiers = [
      ...source.matchAll(/\b(?:import|export)\s+(type\s+)?[\w$*{},\s]*?\s*from\s*['"]([^'"]+)['"]/g),
    ]
      .filter((match) => !match[1])
      .map((match) => match[2])
      .concat([...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)(?!\s*\.\s*[A-Z])/g)].map((match) => match[1]));
    const chain = () => {
      const steps = [];
      for (let step = file; step; step = parents.get(step))
        steps.unshift(path.relative(desktopSource, step).replaceAll("\\", "/"));
      return steps.join(" -> ");
    };
    if (desktopOnlyModules.has(relative) || specifiers.some((name) => name.startsWith("@tauri-apps/")))
      errors.push(`Desktop-only module reached from a mobile pure contract: ${chain()}`);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;
      const next = resolveSource(path.resolve(path.dirname(file), specifier.replace(/\?raw$/, "")));
      if (!next || parents.has(next) || path.relative(desktopSource, next).startsWith("..")) continue;
      parents.set(next, file);
      queue.push(next);
    }
  }
}
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspect(file);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(
      /\bimport\s+(type\s+)?[\w$*{},\s]+?\s+from\s*['"]([^'"]+)['"]/g,
    )) {
      if (match[1]) continue;
      // Some Lucide aliases have types but no runtime file; catch them before Metro.
      if (match[2].startsWith("lucide-react-native/icons/")) {
        try {
          if (!existsSync(fileURLToPath(import.meta.resolve(match[2]))))
            errors.push(
              `${path.relative(mobileRoot, file)}: Use a canonical Lucide runtime icon: ${match[2]}`,
            );
        } catch {
          errors.push(
            `${path.relative(mobileRoot, file)}: Cannot resolve Lucide runtime icon: ${match[2]}`,
          );
        }
      }
      if (!match[2].startsWith(".")) continue;
      const imported = path.resolve(path.dirname(file), match[2]);
      const relative = path.relative(desktopSource, imported).replaceAll("\\", "/");
      if (
        !relative.startsWith("../") &&
        !path.isAbsolute(relative) &&
        !pureContracts.has(relative.replace(/\.tsx?$/, ""))
      ) {
        const line = source.slice(0, match.index).split("\n").length;
        errors.push(
          `${path.relative(mobileRoot, file)}:${line} Use a pure shared contract or an import type; desktop runtime code cannot run on mobile.`,
        );
      } else if (!relative.startsWith("../") && !path.isAbsolute(relative)) contractRoots.add(imported);
    }
  }
}
await inspect(path.join(mobileRoot, "src"));
await inspect(path.join(mobileRoot, "app"));
await inspectContractClosure();
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    "Mobile runtime boundary passed: desktop imports are types or approved pure contracts.\n",
  );
