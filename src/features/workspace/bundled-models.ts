import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";
import { withClaudeAdvisor } from "../../../../src/features/sessions/model/claudeAdvisor";

/** Bundled choices for immediate setup, not a claim of account availability.
 * Snapshot 2026-10-26: Claude desktop fallback and installed Codex model metadata.
 * A nonempty Host catalogue takes precedence, including its supported options.
 */
const EFFORT_LOW_TO_ULTRATHINK: ModelSetting = {
  id: "effort",
  label: "Reasoning",
  kind: "select",
  value: "high",
  options: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
    { value: "ultrathink", label: "Ultrathink" },
  ],
};

const EFFORT_WITH_XHIGH: ModelSetting = {
  id: "effort",
  label: "Reasoning",
  kind: "select",
  value: "high",
  options: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
    { value: "max", label: "Max" },
    {
      value: "ultracode",
      label: "Ultracode",
    },
    { value: "ultrathink", label: "Ultrathink" },
  ],
};

const EFFORT_OPUS_47: ModelSetting = {
  id: "effort",
  label: "Reasoning",
  kind: "select",
  value: "xhigh",
  options: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
    { value: "max", label: "Max" },
    { value: "ultrathink", label: "Ultrathink" },
  ],
};

const FAST_MODE: ModelSetting = {
  id: "fast",
  label: "Fast",
  kind: "toggle",
  value: "false",
  options: [
    { value: "true", label: "On" },
    { value: "false", label: "Off" },
  ],
};

const THINKING: ModelSetting = {
  id: "thinking",
  label: "Thinking",
  kind: "toggle",
  value: "false",
  options: [
    { value: "true", label: "On" },
    { value: "false", label: "Off" },
  ],
};

function contextWindow(defaultValue: "200k" | "1m"): ModelSetting {
  return {
    id: "context",
    label: "Context",
    kind: "select",
    value: defaultValue,
    options: [
      { value: "200k", label: "200k" },
      { value: "1m", label: "1M" },
    ],
  };
}

/** Fallback catalog when `list_models` is unavailable. */
export const CLAUDE_MODEL_CATALOG: AgentModel[] = [
  {
    id: "claude:fable-5",
    harness: "claude",
    name: "Claude Fable 5",
    nativeId: "claude-fable-5",
    settings: [EFFORT_WITH_XHIGH, contextWindow("1m")],
  },
  {
    id: "claude:opus-5",
    harness: "claude",
    name: "Claude Opus 5",
    nativeId: "claude-opus-5",
    settings: [EFFORT_WITH_XHIGH, FAST_MODE, contextWindow("1m")],
  },
  {
    id: "claude:opus-5-5",
    harness: "claude",
    name: "Claude Opus 5.5",
    nativeId: "claude-opus-5-5",
    settings: [EFFORT_WITH_XHIGH, FAST_MODE, contextWindow("1m")],
  },
  {
    id: "claude:sonnet-5",
    harness: "claude",
    name: "Claude Sonnet 5",
    nativeId: "claude-sonnet-5",
    settings: [EFFORT_WITH_XHIGH, contextWindow("200k")],
  },
  {
    id: "claude:opus-4.8",
    harness: "claude",
    name: "Claude Opus 4.8",
    nativeId: "claude-opus-4-8",
    settings: [EFFORT_WITH_XHIGH, FAST_MODE],
  },
  {
    id: "claude:opus-4.7",
    harness: "claude",
    name: "Claude Opus 4.7",
    nativeId: "claude-opus-4-7",
    settings: [EFFORT_OPUS_47, FAST_MODE],
  },
  {
    id: "claude:opus-4.6",
    harness: "claude",
    name: "Claude Opus 4.6",
    nativeId: "claude-opus-4-6",
    settings: [EFFORT_LOW_TO_ULTRATHINK, FAST_MODE, contextWindow("1m")],
  },
  {
    id: "claude:sonnet-4.6",
    harness: "claude",
    name: "Claude Sonnet 4.6",
    nativeId: "claude-sonnet-4-6",
    settings: [EFFORT_LOW_TO_ULTRATHINK, contextWindow("200k")],
  },
  {
    id: "claude:opus-4.5",
    harness: "claude",
    name: "Claude Opus 4.5",
    nativeId: "claude-opus-4-5",
    settings: [
      {
        id: "effort",
        label: "Reasoning",
        kind: "select",
        value: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "max", label: "Max" },
        ],
      },
      FAST_MODE,
    ],
  },
  {
    id: "claude:haiku-4.5",
    harness: "claude",
    name: "Claude Haiku 4.5",
    nativeId: "claude-haiku-4-5",
    settings: [THINKING],
  },
];

export const BUNDLED_CLAUDE_MODELS = CLAUDE_MODEL_CATALOG.map((model) => withClaudeAdvisor(model, CLAUDE_MODEL_CATALOG));

export const CODEX_MODEL_CATALOG: AgentModel[] = [
  {
    "id": "codex:gpt-6.1-sol",
    "nativeId": "gpt-6.1-sol",
    "harness": "codex",
    "name": "GPT-6.1-Sol",
    "settings": [
      {
        "id": "reasoningEffort",
        "label": "Reasoning",
        "kind": "select",
        "value": "low",
        "options": [
          {
            "value": "low",
            "label": "Low"
          },
          {
            "value": "medium",
            "label": "Medium"
          },
          {
            "value": "high",
            "label": "High"
          },
          {
            "value": "xhigh",
            "label": "Xhigh"
          },
          {
            "value": "max",
            "label": "Max"
          },
          {
            "value": "ultra",
            "label": "Ultra"
          }
        ]
      },
      {
        "id": "serviceTier",
        "label": "Service Tier",
        "kind": "select",
        "value": "default",
        "options": [
          {
            "value": "default",
            "label": "Standard"
          },
          {
            "value": "priority",
            "label": "Fast"
          }
        ]
      }
    ]
  },
  {
    "id": "codex:gpt-6-astra",
    "nativeId": "gpt-6-astra",
    "harness": "codex",
    "name": "GPT-6-Astra",
    "settings": [
      {
        "id": "reasoningEffort",
        "label": "Reasoning",
        "kind": "select",
        "value": "medium",
        "options": [
          {
            "value": "low",
            "label": "Low"
          },
          {
            "value": "medium",
            "label": "Medium"
          },
          {
            "value": "high",
            "label": "High"
          },
          {
            "value": "xhigh",
            "label": "Xhigh"
          },
          {
            "value": "max",
            "label": "Max"
          },
          {
            "value": "ultra",
            "label": "Ultra"
          }
        ]
      },
      {
        "id": "serviceTier",
        "label": "Service Tier",
        "kind": "select",
        "value": "default",
        "options": [
          {
            "value": "default",
            "label": "Standard"
          },
          {
            "value": "priority",
            "label": "Fast"
          }
        ]
      }
    ]
  },
  {
    "id": "codex:gpt-6-sol",
    "nativeId": "gpt-6-sol",
    "harness": "codex",
    "name": "GPT-6-Sol",
    "settings": [
      {
        "id": "reasoningEffort",
        "label": "Reasoning",
        "kind": "select",
        "value": "medium",
        "options": [
          {
            "value": "low",
            "label": "Low"
          },
          {
            "value": "medium",
            "label": "Medium"
          },
          {
            "value": "high",
            "label": "High"
          },
          {
            "value": "xhigh",
            "label": "Xhigh"
          },
          {
            "value": "max",
            "label": "Max"
          },
          {
            "value": "ultra",
            "label": "Ultra"
          }
        ]
      },
      {
        "id": "serviceTier",
        "label": "Service Tier",
        "kind": "select",
        "value": "default",
        "options": [
          {
            "value": "default",
            "label": "Standard"
          },
          {
            "value": "priority",
            "label": "Fast"
          }
        ]
      }
    ]
  },
  {
    "id": "codex:gpt-6-luna",
    "nativeId": "gpt-6-luna",
    "harness": "codex",
    "name": "GPT-6-Luna",
    "settings": [
      {
        "id": "reasoningEffort",
        "label": "Reasoning",
        "kind": "select",
        "value": "medium",
        "options": [
          {
            "value": "low",
            "label": "Low"
          },
          {
            "value": "medium",
            "label": "Medium"
          },
          {
            "value": "high",
            "label": "High"
          },
          {
            "value": "xhigh",
            "label": "Xhigh"
          },
          {
            "value": "max",
            "label": "Max"
          }
        ]
      },
      {
        "id": "serviceTier",
        "label": "Service Tier",
        "kind": "select",
        "value": "default",
        "options": [
          {
            "value": "default",
            "label": "Standard"
          },
          {
            "value": "priority",
            "label": "Fast"
          }
        ]
      }
    ]
  },
  {
    "id": "codex:gpt-5.6-sol",
    "nativeId": "gpt-5.6-sol",
    "harness": "codex",
    "name": "GPT-5.6-Sol",
    "settings": [
      {
        "id": "reasoningEffort",
        "label": "Reasoning",
        "kind": "select",
        "value": "low",
        "options": [
          {
            "value": "low",
            "label": "Low"
          },
          {
            "value": "medium",
            "label": "Medium"
          },
          {
            "value": "high",
            "label": "High"
          },
          {
            "value": "xhigh",
            "label": "Xhigh"
          },
          {
            "value": "max",
            "label": "Max"
          },
          {
            "value": "ultra",
            "label": "Ultra"
          }
        ]
      },
      {
        "id": "serviceTier",
        "label": "Service Tier",
        "kind": "select",
        "value": "default",
        "options": [
          {
            "value": "default",
            "label": "Standard"
          },
          {
            "value": "priority",
            "label": "Fast"
          }
        ]
      }
    ]
  }
];
