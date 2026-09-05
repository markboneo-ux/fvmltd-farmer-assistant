/**
 * Resolve short deictic follow-ups from the immediately preceding assistant turn.
 * “Refer to the what??” should not become a generic clarification request.
 */

export type ConversationTurn = {
  role: string;
  content: string;
};

export type ResolvedReference = {
  isReference: boolean;
  resolvedMessage: string;
  referent: string | null;
  reason: string | null;
};

const REFERENCE_ASK =
  /^(refer to (the )?what\??|refer to what\??|the what\??|what\??|which (one|source|ministry|register|list)\??|that one\??|show me|give me the list|what do you mean\??|the source\??|which ministry\??|what source\??)\s*[?.!]*$/i;

const LOOSE_REFERENCE =
  /\b(refer to (the )?what|which one|that one|the source\??|which ministry|what do you mean|show me that|give me the list|the register)\b/i;

export function isDeicticFollowUp(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (text.length > 140) return false;
  return REFERENCE_ASK.test(text) || (text.length <= 80 && LOOSE_REFERENCE.test(text));
}

export function lastAssistantContent(history: ConversationTurn[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role === "assistant" && item.content.trim()) return item.content.trim();
  }
  return null;
}

const REFERENT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "the official pesticide register",
    pattern:
      /\b((?:official |current |public )?(?:pesticide |chemical )?register(?: of (?:pesticides|chemicals))?|pesticide product listings?|list of pesticide products)\b/i,
  },
  {
    label: "the Ministry of Agriculture",
    pattern: /\bministry of agriculture\b/i,
  },
  {
    label: "the Chemistry, Food and Drugs Division pesticide listing",
    pattern: /\b(chemistry, food and drugs|cfdd|pesticides and toxic chemicals)\b/i,
  },
  {
    label: "the official source",
    pattern: /\b(official (?:source|listing|page|notice)|public notice)\b/i,
  },
];

export function extractReferentFromAssistant(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const item of REFERENT_PATTERNS) {
    if (item.pattern.test(trimmed)) return item.label;
  }
  const referTo = trimmed.match(/\brefer to (?:the )?([^.]{8,80})/i);
  if (referTo?.[1]) return referTo[1].trim().replace(/[.,;:]+$/, "");
  const quoted = trimmed.match(/[“"]([^”"]{8,80})[”"]/);
  if (quoted?.[1]) return quoted[1].trim();
  return null;
}

export function resolveConversationReference(options: {
  message: string;
  history?: ConversationTurn[];
}): ResolvedReference {
  const message = options.message.trim();
  const history = options.history ?? [];
  if (!isDeicticFollowUp(message)) {
    return {
      isReference: false,
      resolvedMessage: message,
      referent: null,
      reason: null,
    };
  }

  const previous = lastAssistantContent(history);
  if (!previous) {
    return {
      isReference: false,
      resolvedMessage: message,
      referent: null,
      reason: null,
    };
  }

  const referent = extractReferentFromAssistant(previous);
  if (!referent) {
    return {
      isReference: false,
      resolvedMessage: message,
      referent: null,
      reason: null,
    };
  }

  const show =
    /\b(show me|give me the list|the list|the source|the register)\b/i.test(message) ||
    /refer to (the )?what/i.test(message);

  const resolvedMessage = show
    ? `Show me ${referent}`
    : `Please explain ${referent}`;

  return {
    isReference: true,
    resolvedMessage,
    referent,
    reason: "previous_assistant_turn",
  };
}
