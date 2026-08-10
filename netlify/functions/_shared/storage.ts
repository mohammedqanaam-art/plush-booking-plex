import { getDeployStore, getStore } from "@netlify/blobs";

type StoreOptions = {
  consistency?: "strong";
};

export const getEnvironmentStore = (name: string, options: StoreOptions = {}) => {
  const deploy = typeof Netlify === "undefined" ? undefined : Netlify.context?.deploy;
  if (deploy?.context === "production") {
    return options.consistency === "strong"
      ? getStore({ name, consistency: "strong" })
      : getStore(name);
  }
  return deploy?.id
    ? getDeployStore({ name, deployID: deploy.id })
    : getDeployStore(name);
};
