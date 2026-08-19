const configuredSecret = () => Netlify.env.get("BHG_KNOWLEDGE_REFRESH_SECRET")?.trim() || "";

const configuredOrigin = (override?: string) => {
  const raw = override
    || Netlify.env.get("DEPLOY_PRIME_URL")
    || Netlify.env.get("URL")
    || "";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("BHG_KNOWLEDGE_ORIGIN_INVALID");
  }
  return url.origin;
};

export const queueBranchKnowledgeRefresh = async (origin?: string) => {
  const secret = configuredSecret();
  if (!secret) throw new Error("BHG_KNOWLEDGE_REFRESH_SECRET_MISSING");
  const endpoint = new URL(
    "/.netlify/functions/branch-knowledge-refresh-background",
    configuredOrigin(origin),
  );
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-BHG-Knowledge-Key": secret,
      "X-BHG-Request-Id": crypto.randomUUID(),
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (![200, 202].includes(response.status)) {
    throw new Error(`BHG_KNOWLEDGE_QUEUE_${response.status}`);
  }
  return { queued: true as const, status: response.status };
};
